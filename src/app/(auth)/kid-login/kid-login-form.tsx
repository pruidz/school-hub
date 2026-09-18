"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, UserPlus, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { describeChildrenForDevice, signInChildWithPin } from "@/lib/auth/child";
import {
  forgetDeviceChild,
  getDeviceChildrenServerSnapshot,
  getDeviceChildrenSnapshot,
  rememberDeviceChild,
  subscribeDeviceChildren,
  syncDeviceChildren,
  type DeviceChild,
} from "@/lib/auth/device-children";
import { ka, t } from "@/lib/i18n/ka";

import { FormError } from "../_components/form-parts";
import { PinInput } from "../_components/pin-input";

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** `false` during SSR and the first paint, `true` once hydrated. */
const subscribeNothing = () => () => {};

export function KidLoginForm() {
  const router = useRouter();

  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const children = React.useSyncExternalStore(
    subscribeDeviceChildren,
    getDeviceChildrenSnapshot,
    getDeviceChildrenServerSnapshot,
  );

  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // One child on the device is the normal case: go straight to the PIN pad
  // instead of making them tap their own face first. Derived, not stored, so
  // it survives the list being refreshed underneath.
  const onlyChild = children.length === 1 ? children[0].childId : null;
  const selectedId = chosenId ?? onlyChild;

  const selected = children.find((child) => child.childId === selectedId);

  // Refresh names and avatars once per mount. The store update happens in the
  // promise callback, never synchronously in the effect body.
  const refreshed = React.useRef(false);
  React.useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;

    const stored = getDeviceChildrenSnapshot();
    if (stored.length === 0) return;

    void describeChildrenForDevice(
      stored.map((child) => child.childId),
    ).then((result) => {
      // On a failed refresh keep the cached list rather than wiping it.
      if (!result.ok) return;
      const order = new Map(
        stored.map((child, index) => [child.childId, index] as const),
      );
      const fresh: DeviceChild[] = result.data
        .map((child) => ({
          childId: child.childId,
          name: child.name,
          avatarUrl: child.avatarUrl,
          color: child.color,
        }))
        .sort(
          (a, b) => (order.get(a.childId) ?? 0) - (order.get(b.childId) ?? 0),
        );
      syncDeviceChildren(fresh);
    });
  }, []);

  function submitPin(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError(null);

    const childId = selected.childId;
    const value = pin;

    startTransition(async () => {
      const result = await signInChildWithPin({ childId, pin: value });
      setPin("");

      if (!result.ok) {
        setError(result.message);
        return;
      }

      rememberDeviceChild(result.data);
      router.replace("/kid");
      router.refresh();
    });
  }

  if (!hydrated) {
    return (
      <div className="flex justify-center py-8" aria-busy>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selected) {
    return (
      <form onSubmit={submitPin} className="grid gap-5" noValidate>
        <div className="flex flex-col items-center gap-2">
          <Avatar className="size-20">
            {selected.avatarUrl ? (
              <AvatarImage src={selected.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="text-2xl">
              {initials(selected.name)}
            </AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold">
            {t("auth.kidWelcome", { name: selected.name })}
          </p>
        </div>

        <FormError message={error} />

        <PinInput
          name="pin"
          label={ka.auth.kidEnterPin}
          value={pin}
          onValueChange={setPin}
          disabled={pending}
          autoFocus
        />

        <Button
          type="submit"
          size="lg"
          className="h-14 w-full text-base"
          disabled={pending || pin.length !== 4}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {ka.auth.signIn}
        </Button>

        {children.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setChosenId(null);
              setPin("");
              setError(null);
            }}
          >
            <ArrowLeft />
            {ka.auth.kidBackToList}
          </Button>
        ) : (
          <Button asChild variant="ghost" className="w-full">
            <Link href="/join">{ka.auth.kidAddDevice}</Link>
          </Button>
        )}
      </form>
    );
  }

  // Nothing remembered: storage was cleared, or this is a new device. Say what
  // to do about it — the child cannot get a code without a parent.
  if (children.length === 0) {
    return (
      <div className="grid gap-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
          <UserPlus className="size-7 text-muted-foreground" />
        </div>

        <div className="grid gap-1">
          <p className="text-base font-semibold">{ka.auth.kidNoDevicesTitle}</p>
          <p className="text-sm text-muted-foreground">
            {ka.auth.kidNoDevicesHelp}
          </p>
        </div>

        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link href="/join">{ka.auth.kidNoDevicesAction}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {children.map((child) => (
          <li key={child.childId} className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-16 flex-1 justify-start gap-3 text-base"
              onClick={() => {
                setChosenId(child.childId);
                setError(null);
              }}
            >
              <Avatar className="size-10">
                {child.avatarUrl ? (
                  <AvatarImage src={child.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback>{initials(child.name)}</AvatarFallback>
              </Avatar>
              {child.name}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={`${ka.auth.kidRemoveDevice}: ${child.name}`}
              onClick={() => forgetDeviceChild(child.childId)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>

      <Button asChild variant="secondary" className="h-12 w-full text-base">
        <Link href="/join">{ka.auth.kidAddDevice}</Link>
      </Button>
    </div>
  );
}
