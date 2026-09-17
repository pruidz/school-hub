"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupInviteCode, redeemInviteCode } from "@/lib/auth/child";
import { rememberDeviceChild } from "@/lib/auth/device-children";
import { INVITE_CODE_LENGTH, normalizeInviteCode } from "@/lib/auth/codes";
import { ka, t } from "@/lib/i18n/ka";

import { FormError } from "../_components/form-parts";
import { PinInput } from "../_components/pin-input";

type Step = "code" | "pin";

export function JoinForm() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("code");
  const [code, setCode] = React.useState("");
  const [childName, setChildName] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [pinConfirm, setPinConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const codeReady = normalizeInviteCode(code).length === INVITE_CODE_LENGTH;
  const pinReady = pin.length === 4 && pinConfirm.length === 4;

  function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await lookupInviteCode({ code });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setChildName(result.data.name);
      setStep("pin");
    });
  }

  function submitPin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (pin !== pinConfirm) {
      setError(ka.validation.pinsDoNotMatch);
      return;
    }

    startTransition(async () => {
      const result = await redeemInviteCode({ code, pin, pinConfirm });
      if (!result.ok) {
        setError(result.message);
        setPin("");
        setPinConfirm("");
        return;
      }

      rememberDeviceChild(result.data);
      router.replace("/kid");
      router.refresh();
    });
  }

  if (step === "pin") {
    return (
      <form onSubmit={submitPin} className="grid gap-5" noValidate>
        <p className="text-base">{t("auth.kidWelcome", { name: childName })}</p>

        <FormError message={error} />

        <PinInput
          name="pin"
          label={ka.auth.pin}
          value={pin}
          onValueChange={setPin}
          disabled={pending}
          autoFocus
        />

        <PinInput
          name="pinConfirm"
          label={ka.auth.pinConfirm}
          value={pinConfirm}
          onValueChange={setPinConfirm}
          disabled={pending}
        />

        <Button
          type="submit"
          size="lg"
          className="h-14 w-full text-base"
          disabled={pending || !pinReady}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {ka.auth.pinSave}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => {
            setStep("code");
            setError(null);
            setPin("");
            setPinConfirm("");
          }}
        >
          <ArrowLeft />
          {ka.common.back}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="grid gap-5" noValidate>
      <FormError message={error} />

      <div className="grid gap-2">
        <Label htmlFor="invite-code" className="text-base">
          {ka.auth.inviteCode}
        </Label>
        <Input
          id="invite-code"
          name="code"
          value={code}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          onChange={(event) =>
            setCode(normalizeInviteCode(event.target.value).slice(0, INVITE_CODE_LENGTH))
          }
          className="h-16 text-center font-mono text-3xl tracking-[0.35em] uppercase"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-14 w-full text-base"
        disabled={pending || !codeReady}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {ka.auth.inviteContinue}
      </Button>
    </form>
  );
}
