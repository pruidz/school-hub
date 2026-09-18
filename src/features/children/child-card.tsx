"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, Pencil } from "lucide-react";
import { cn } from "cn";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ka, t } from "@/lib/i18n/ka";

import { setChildActive } from "./actions";
import { ChildFormDialog } from "./child-form-dialog";
import type { ChildView } from "./queries";

export function ChildCard({
  child,
  selected,
}: {
  child: ChildView;
  selected: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  function toggleActive() {
    startTransition(async () => {
      const result = await setChildActive({
        childId: child.id,
        isActive: !child.isActive,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        child.isActive
          ? ka.children.archivedToast
          : ka.children.restoredToast,
      );
    });
  }

  return (
    <article
      className={cn(
        "relative grid gap-3 rounded-xl border bg-card p-4 transition",
        selected ? "ring-2 ring-ring" : "hover:bg-accent/40",
        child.isActive ? "" : "opacity-60",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 start-0 w-1.5 rounded-s-xl"
        style={{ backgroundColor: child.color }}
      />

      <div className="flex gap-3">
        <Avatar className="ms-2 size-12">
          {child.avatarUrl ? <AvatarImage src={child.avatarUrl} alt="" /> : null}
          <AvatarFallback style={{ backgroundColor: `${child.color}22` }}>
            {child.name.trim().slice(0, 1).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* The whole card is the selection target; the link stretches over it
                so the action buttons stay clickable on top (z-10). */}
            <Link
              href={`/parent/children?child=${child.id}`}
              scroll={false}
              className="truncate font-medium after:absolute after:inset-0 after:content-['']"
            >
              {child.name}
            </Link>
            {child.isActive ? null : (
              <Badge variant="secondary">{ka.children.archived}</Badge>
            )}
          </div>

          <p className="truncate text-sm text-muted-foreground">
            {child.grade
              ? t("children.gradeValue", { grade: child.grade })
              : ka.children.gradeNone}
            {" · "}
            {child.school ?? ka.children.schoolNone}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {child.isLinked ? ka.children.linked : ka.children.notLinked}
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 items-start gap-1">
          <ChildFormDialog
            child={child}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={ka.children.edit}
                title={ka.children.edit}
              >
                <Pencil />
              </Button>
            }
          />

          {child.isActive ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  aria-label={ka.children.archive}
                  title={ka.children.archive}
                >
                  <Archive />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("children.archiveConfirmTitle", { name: child.name })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {ka.children.archiveConfirmBody}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={toggleActive}>
                    {ka.children.archive}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              onClick={toggleActive}
              aria-label={ka.children.restore}
              title={ka.children.restore}
            >
              <ArchiveRestore />
            </Button>
          )}
        </div>
      </div>

      {/* The way through to P4. The card itself stays the "select for editing"
          target, so this sits above the stretched link (z-10) like the icons. */}
      <Button
        asChild
        variant="secondary"
        size="sm"
        className="relative z-10 w-full justify-between"
      >
        <Link href={`/parent/children/${child.id}`}>
          <span className="grid text-start">
            <span>{ka.children.pageOpen}</span>
            <span className="text-xs font-normal opacity-70">
              {ka.children.pageOpenHint}
            </span>
          </span>
          <ChevronLeft aria-hidden className="rotate-180" />
        </Link>
      </Button>
    </article>
  );
}
