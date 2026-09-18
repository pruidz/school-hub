"use client";

/**
 * Keeps the "who uses this device" list alive, and asks the browser to hold
 * on to storage.
 *
 * Mounted in the kid shell, so it runs whenever a child actually uses the app.
 * Two cheap things, at most once a day:
 *
 *  1. `navigator.storage.persist()` — Chrome and Firefox will exempt persisted
 *     origins from eviction. Safari does not implement it, so on iOS this is a
 *     no-op and the seven-day clearing rule still applies to a web app that
 *     goes unused. It is an improvement, not a guarantee.
 *  2. Re-write this child into `device-children`, so the sign-in screen can
 *     still show their face after storage was cleared — a PIN then gets them
 *     back in, with no parent and no invite code.
 */

import * as React from "react";

import { rememberDeviceChild } from "@/lib/auth/device-children";

import { describeSignedInChild } from "./actions";

const CHECKED_KEY = "school-hub:device-checked-at";
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

function checkedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(CHECKED_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < CHECK_EVERY_MS;
  } catch {
    return false;
  }
}

function markChecked(): void {
  try {
    window.localStorage.setItem(CHECKED_KEY, String(Date.now()));
  } catch {
    // Storage is unavailable; the check simply runs again next time.
  }
}

async function requestPersistence(): Promise<void> {
  try {
    const storage = window.navigator.storage;
    if (!storage?.persist || !storage.persisted) return;
    if (await storage.persisted()) return;
    await storage.persist();
  } catch {
    // Unsupported or refused. Nothing depends on it succeeding.
  }
}

export function DeviceMemory() {
  React.useEffect(() => {
    if (checkedRecently()) return;

    let cancelled = false;

    void (async () => {
      await requestPersistence();

      try {
        const child = await describeSignedInChild();
        if (cancelled || !child) return;
        rememberDeviceChild(child);
        markChecked();
      } catch {
        // Offline, or the session expired mid-flight. Try again next mount.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
