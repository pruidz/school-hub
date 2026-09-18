import "server-only";

/**
 * The card that drops into `/parent/settings` and `/kid/me`.
 *
 * An RSC so the device list is already rendered on first paint — the client
 * half then corrects it with whatever this particular browser turns out to
 * support. The VAPID public key is read here rather than in the client bundle
 * so that a deploy without keys renders "not available" instead of a button
 * that cannot work.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ka } from "@/lib/i18n/ka";

import { vapidPublicKey } from "./config";
import { listOwnPushDevices } from "./queries";
import { PushSettings } from "./push-settings";

export async function PushSettingsCard({
  variant,
}: {
  variant: "parent" | "kid";
}) {
  // The endpoint is unknown server-side — only the browser knows which
  // subscription it holds — so `currentId` is filled in by the client's first
  // `refreshDevicesAction` call.
  const initial = await listOwnPushDevices(null);
  const isKid = variant === "kid";

  return (
    <Card>
      <CardHeader>
        <CardTitle className={isKid ? "text-lg" : undefined}>
          {isKid ? ka.push.kidTitle : ka.push.title}
        </CardTitle>
        <CardDescription>
          {isKid ? ka.push.kidSubtitle : ka.push.subtitle}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PushSettings
          variant={variant}
          vapidPublicKey={vapidPublicKey()}
          initial={initial}
        />
      </CardContent>
    </Card>
  );
}
