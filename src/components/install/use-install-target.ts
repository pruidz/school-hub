"use client";

/**
 * Decides whether to offer installation, and how.
 *
 * Three outcomes:
 *  - `ios`     iOS Safari, not installed. The button is buried in the share
 *              sheet, so the only thing we can do is say where it is.
 *  - `prompt`  a browser that fired `beforeinstallprompt` (Chrome, Edge,
 *              Samsung Internet, desktop and Android). We show a real button.
 *  - `none`    already installed, dismissed, or a browser that cannot install.
 *
 * All of it is environment, not state, so it is read through
 * `useSyncExternalStore` — same approach as `device-children`. The server
 * snapshot reports "dismissed", which makes the first paint match the HTML and
 * the hint appear only after hydration.
 */

import * as React from "react";

const DISMISSED_KEY = "school-hub:install-hint-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallTarget =
  | { kind: "none" }
  | { kind: "ios" }
  | { kind: "prompt"; install: () => void };

/* -------------------------------------------------------------------------- */
/*  environment                                                               */
/* -------------------------------------------------------------------------- */

const STANDALONE_QUERIES = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
];

function mediaLists(): MediaQueryList[] {
  try {
    return STANDALONE_QUERIES.map((query) => window.matchMedia(query));
  } catch {
    return [];
  }
}

function subscribeDisplayMode(onChange: () => void): () => void {
  const lists = mediaLists();
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function isStandalone(): boolean {
  // `navigator.standalone` is the iOS answer; `display-mode` is everyone else.
  const legacy = (window.navigator as Navigator & { standalone?: boolean })
    .standalone;
  if (legacy === true) return true;
  return mediaLists().some((list) => list.matches);
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;

  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points give it away.
    (ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1);
  if (!ios) return false;

  // Every iOS browser is WebKit, but only Safari's share sheet has the item we
  // describe. In-app browsers (Facebook, Instagram) cannot install at all.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(ua);
}

/* -------------------------------------------------------------------------- */
/*  the dismissal, kept in localStorage                                       */
/* -------------------------------------------------------------------------- */

const dismissListeners = new Set<() => void>();

function subscribeDismissed(listener: () => void): () => void {
  dismissListeners.add(listener);
  return () => {
    dismissListeners.delete(listener);
  };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Private browsing can throw on read. Showing the hint is the safe side.
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // It will come back next time; not worth telling anyone about.
  }
  for (const listener of dismissListeners) listener();
}

/** Hidden during SSR and the first client paint. */
const alwaysTrue = () => true;
const alwaysFalse = () => false;
const subscribeNothing = () => () => {};

/* -------------------------------------------------------------------------- */
/*  hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useInstallTarget(): {
  target: InstallTarget;
  dismiss: () => void;
} {
  const dismissed = React.useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    alwaysTrue,
  );
  const standalone = React.useSyncExternalStore(
    subscribeDisplayMode,
    isStandalone,
    alwaysFalse,
  );
  const ios = React.useSyncExternalStore(
    subscribeNothing,
    isIosSafari,
    alwaysFalse,
  );

  const [prompt, setPrompt] = React.useState<BeforeInstallPromptEvent | null>(
    null,
  );

  React.useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Keep the event so the button can replay it; the browser only hands it
      // over once, and only while the app is not installed.
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setPrompt(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = React.useCallback(() => {
    if (!prompt) return;
    void prompt.prompt().catch(() => undefined);
    void prompt.userChoice
      .then(() => setPrompt(null))
      .catch(() => setPrompt(null));
  }, [prompt]);

  const target: InstallTarget = React.useMemo(() => {
    if (dismissed || standalone) return { kind: "none" };
    if (prompt) return { kind: "prompt", install };
    if (ios) return { kind: "ios" };
    return { kind: "none" };
  }, [dismissed, install, ios, prompt, standalone]);

  return { target, dismiss: writeDismissed };
}
