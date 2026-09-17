"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteAssignmentAction } from "@/features/assignments/actions";
import { ka, t } from "@/lib/i18n/ka";

export function DeleteAssignmentButton({
  assignmentId,
  title,
}: {
  assignmentId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const remove = async () => {
    setBusy(true);
    const result = await deleteAssignmentAction({ assignmentId });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(ka.assignments.deleted);
    router.push("/parent/assignments");
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          {ka.assignments.deleteTitle}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ka.assignments.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("assignments.deleteConfirm", { title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void remove()}>
            {ka.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
