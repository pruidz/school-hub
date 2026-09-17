"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionFailure } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";

import { createChild, updateChild } from "./actions";
import {
  ColorField,
  DEFAULT_CHILD_COLOR,
  FormError,
  SubmitButton,
  TextField,
} from "./form-ui";
import type { ChildView } from "./queries";

/**
 * One dialog for both "add a child" and "edit this child" — the fields are
 * identical and keeping them in one place stops the two forms drifting apart.
 */
export function ChildFormDialog({
  child,
  trigger,
}: {
  /** `undefined` = create mode. */
  child?: ChildView;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction] = useActionState<ActionFailure | null, FormData>(
    async (_previous, formData) => {
      const payload = {
        name: String(formData.get("name") ?? ""),
        grade: String(formData.get("grade") ?? ""),
        school: String(formData.get("school") ?? ""),
        birthDate: String(formData.get("birthDate") ?? ""),
        color: String(formData.get("color") ?? DEFAULT_CHILD_COLOR),
        avatarUrl: String(formData.get("avatarUrl") ?? ""),
      };

      const result = child
        ? await updateChild({ ...payload, childId: child.id })
        : await createChild(payload);

      if (!result.ok) return result;

      toast.success(child ? ka.children.updated : ka.children.created);
      setOpen(false);
      return null;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            {ka.children.add}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {child ? ka.children.edit : ka.children.add}
          </DialogTitle>
          <DialogDescription>{ka.children.subtitle}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormError message={state?.message} />

          <TextField
            name="name"
            label={ka.children.name}
            defaultValue={child?.name ?? ""}
            autoComplete="off"
            required
            error={state?.fields?.name}
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              name="grade"
              label={ka.children.grade}
              type="number"
              min={1}
              max={12}
              inputMode="numeric"
              defaultValue={child?.grade ?? ""}
              error={state?.fields?.grade}
            />
            <TextField
              name="birthDate"
              label={ka.children.birthDate}
              type="date"
              defaultValue={child?.birthDate ?? ""}
              error={state?.fields?.birthDate}
            />
          </div>

          <TextField
            name="school"
            label={ka.children.school}
            defaultValue={child?.school ?? ""}
            autoComplete="off"
            error={state?.fields?.school}
          />

          <TextField
            name="avatarUrl"
            label={ka.children.avatarUrl}
            type="url"
            placeholder="https://…"
            defaultValue={child?.avatarUrl ?? ""}
            hint={ka.common.optional}
            error={state?.fields?.avatarUrl}
          />

          <ColorField
            name="color"
            label={ka.children.color}
            defaultValue={child?.color ?? DEFAULT_CHILD_COLOR}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {ka.common.cancel}
            </Button>
            <SubmitButton>
              {child ? ka.common.save : ka.common.create}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
