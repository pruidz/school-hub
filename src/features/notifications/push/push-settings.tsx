"use client";

/**
 * "Turn notifications on for this phone", for a parent and for a nine-year-old.
 *
 * One component, two registers of Georgian, because the mechanics are identical
 * and the wording is not. Everything the user needs in order to trust this is
 * on screen: what the browser currently allows, in words; which devices are
 * registered; and a button that makes the phone buzz right now.
 *
 * The permission prompt is raised from the click handler and nowhere else —
 * `subscribeThisBrowser()` is the first await inside it, so the user activation
 * iOS insists on is still alive when `Notification.requestPermission()` runs.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { BellRing, BellOff, Send, Trash2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/features/assignments/dates";
import { ka, t } from "@/lib/i18n/ka";

import {
  readPushState,
  subscribeThisBrowser,
  unsubscribeThisBrowser,
  type PushAvailability,
} from "./client";
import {
  refreshDevicesAction,
  removeDeviceAction,
  sendTestPushAction,
  subscribeDeviceAction,
} from "./actions";
import type { PushDeviceList } from "./types";

export type PushSettingsProps = {
  variant: "parent" | "kid";
  /** `null` when the deploy has no VAPID keys; the UI then says so plainly. */
  vapidPublicKey: string | null;
  initial: PushDeviceList;
};

/** The sentence under the heading, per state. */
function statusLine(
  state: PushAvailability,
  variant: "parent" | "kid",
): string {
  switch (state) {
    case "checking":
      return ka.push.checking;
    case "unsupported":
      return ka.push.stateUnsupported;
    case "needs-install":
      return variant === "kid"
        ? ka.push.kidNeedsInstall
        : ka.push.stateNeedsInstall;
    case "blocked":
      return ka.push.stateBlocked;
    case "on":
      return variant === "kid" ? ka.push.kidStateOn : ka.push.stateOn;
    case "off":
      return variant === "kid" ? ka.push.kidStateOff : ka.push.stateOff;
  }
}

/** The extra paragraph that tells them what to do about it, when there is one. */
function statusHint(state: PushAvailability): string | null {
  if (state === "needs-install") return ka.push.needsInstallHint;
  if (state === "blocked") return ka.push.stateBlockedHint;
  if (state === "unsupported") return ka.push.stateUnsupportedHint;
  return null;
}

export function PushSettings({
  variant,
  vapidPublicKey,
  initial,
}: PushSettingsProps) {
  const isKid = variant === "kid";

  const [state, setState] = useState<PushAvailability>("checking");
  const [list, setList] = useState<PushDeviceList>(initial);
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<"enable" | "test" | null>(null);

  /**
   * Read-only on mount: what the browser already allows, and which of the rows
   * the server returned is this device. Asks the user nothing — a page that
   * prompts on first paint is a page that gets blocked forever.
   *
   * Both writes happen after an await, never synchronously in the effect body,
   * and a cancelled flag stops a slow round trip from writing into an unmounted
   * component when the user navigates away mid-check.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let next = await readPushState();
      if (cancelled) return;

      /**
       * Self-healing, and the only reason iOS is usable at all.
       *
       * Push services expire endpoints and browsers rotate them. Chrome tells
       * the worker through `pushsubscriptionchange`; Safari does not fire that
       * event, so an iPhone that loses its subscription would go quiet forever
       * and the user would have no way of knowing. Here the page notices
       * "permission is granted but there is no subscription" and quietly makes
       * a new one.
       *
       * No prompt is raised: `requestPermission()` on an already-granted origin
       * resolves immediately without asking, so this needs no user gesture and
       * cannot be the thing that gets the site blocked. It runs only when there
       * is genuinely nothing subscribed.
       */
      if (
        next.state === "off" &&
        vapidPublicKey !== null &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const repaired = await subscribeThisBrowser(vapidPublicKey);
        if (cancelled) return;
        if (repaired.ok) {
          const saved = await subscribeDeviceAction(repaired.subscription);
          if (cancelled) return;
          if (saved.ok) {
            setState("on");
            setList(saved.data);
            return;
          }
        }
        next = await readPushState();
        if (cancelled) return;
      }

      setState(next.state);

      const fresh = await refreshDevicesAction({ endpoint: next.endpoint });
      // `null` means the session went away; keep what is on screen rather than
      // blanking a list the user was reading.
      if (cancelled || !fresh) return;
      setList(fresh);
    })();

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const onEnable = useCallback(async () => {
    if (!vapidPublicKey) {
      toast.error(ka.push.stateUnsupported);
      return;
    }

    setWorking("enable");
    // First await in the handler: the user gesture is still live here.
    const outcome = await subscribeThisBrowser(vapidPublicKey);

    if (!outcome.ok) {
      setWorking(null);
      if (outcome.reason === "denied") {
        setState("blocked");
        toast.error(ka.push.errDenied);
      } else if (outcome.reason === "needs-install") {
        setState("needs-install");
        toast.error(ka.push.stateNeedsInstall);
      } else if (outcome.reason === "unsupported") {
        setState("unsupported");
        toast.error(ka.push.stateUnsupported);
      } else {
        toast.error(ka.push.errGeneric);
      }
      return;
    }

    const result = await subscribeDeviceAction(outcome.subscription);
    setWorking(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setList(result.data);
    setState("on");
    toast.success(ka.push.enabled);
  }, [vapidPublicKey]);

  const onDisable = useCallback(() => {
    startTransition(async () => {
      const removedEndpoint = await unsubscribeThisBrowser();
      const id = list.currentId;
      if (id) {
        const result = await removeDeviceAction({ id });
        if (result.ok) setList(result.data);
      } else if (removedEndpoint) {
        // No row matched this endpoint (it was already reaped, or the list is
        // stale). Nothing to delete; just re-read.
        const fresh = await refreshDevicesAction({ endpoint: null });
        if (fresh) setList(fresh);
      }
      setState("off");
      toast.success(ka.push.disabled);
    });
  }, [list.currentId]);

  const onRemove = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await removeDeviceAction({ id });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setList(result.data);
        if (id === list.currentId) {
          await unsubscribeThisBrowser();
          setState("off");
        }
        toast.success(ka.push.deviceRemoved);
      });
    },
    [list.currentId],
  );

  const onTest = useCallback(async () => {
    setWorking("test");
    const result = await sendTestPushAction();
    setWorking(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(ka.push.testSent);
  }, []);

  const hint = statusHint(state);
  const canEnable = state === "off" && vapidPublicKey !== null;
  const busy = pending || working !== null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className={isKid ? "text-base font-medium" : "text-sm font-medium"}>
          {statusLine(state, variant)}
        </p>
        {hint ? (
          <p className="text-sm text-muted-foreground">{hint}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {canEnable ? (
          <Button
            type="button"
            onClick={onEnable}
            disabled={busy}
            size={isKid ? "lg" : "default"}
            className={isKid ? "h-12 flex-1" : undefined}
          >
            <BellRing />
            {working === "enable"
              ? ka.push.enabling
              : isKid
                ? ka.push.kidEnable
                : ka.push.enable}
          </Button>
        ) : null}

        {state === "on" ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onTest}
              disabled={busy}
              size={isKid ? "lg" : "default"}
              className={isKid ? "h-12 flex-1" : undefined}
            >
              <Send />
              {working === "test"
                ? ka.push.testing
                : isKid
                  ? ka.push.kidTest
                  : ka.push.test}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onDisable}
              disabled={busy}
              size={isKid ? "lg" : "default"}
              className={isKid ? "h-12" : undefined}
            >
              <BellOff />
              {isKid ? ka.push.kidDisable : ka.push.disableThis}
            </Button>
          </>
        ) : null}
      </div>

      {list.devices.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">{ka.push.devicesTitle}</p>
          {!isKid ? (
            <p className="text-sm text-muted-foreground">
              {ka.push.devicesHint}
            </p>
          ) : null}
          <ul className="grid gap-2">
            {list.devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {device.label}
                    {device.id === list.currentId
                      ? ` · ${ka.push.deviceThis}`
                      : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("push.deviceAdded", {
                      date: formatDateTime(device.createdAt),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={ka.push.deviceRemove}
                  disabled={busy}
                  onClick={() => onRemove(device.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : state === "on" ? null : (
        <p className="text-sm text-muted-foreground">{ka.push.devicesEmpty}</p>
      )}
    </div>
  );
}
