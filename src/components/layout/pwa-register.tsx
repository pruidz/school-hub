"use client";

import { useEffect } from "react";

/**
 * Registers the service worker. Mounted only inside the kid layout, so the
 * offline shell is installed for the children's PWA and the parent's desktop
 * app keeps normal network behaviour.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration is a progressive enhancement; failing is not fatal.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
