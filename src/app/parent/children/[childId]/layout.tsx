import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ka, t } from "@/lib/i18n/ka";
import { ChildTabs } from "@/features/children/child-tabs";
import { requireFamilyChild } from "@/features/children/child-scope";

type Params = { childId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { childId } = await params;
  const child = await requireFamilyChild(childId);
  return { title: `${child.name} · ${ka.children.pageOpen}` };
}

/**
 * P4 — the per-child page.
 *
 * The guard lives here and in every page under it. `requireFamilyChild` is
 * `cache()`d, so the pair costs one query, and a page must never rely on its
 * layout having run: a Server Action or a direct RSC request can reach the page
 * without it.
 */
export default async function ChildPageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<Params>;
}) {
  const { childId } = await params;
  const child = await requireFamilyChild(childId);

  return (
    <div className="grid gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ms-2">
          <Link href="/parent/children">
            <ChevronLeft />
            {ka.children.pageBack}
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <Avatar className="size-12 shrink-0">
          {child.avatarUrl ? <AvatarImage src={child.avatarUrl} alt="" /> : null}
          <AvatarFallback style={{ backgroundColor: `${child.color}22` }}>
            {child.name.trim().slice(0, 1).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {child.name}
            </h1>
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
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href={`/parent/children?child=${child.id}`}>
            <Pencil />
            {ka.children.edit}
          </Link>
        </Button>
      </header>

      <ChildTabs childId={child.id} />

      {children}
    </div>
  );
}
