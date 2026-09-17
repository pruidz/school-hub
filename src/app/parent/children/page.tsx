import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireParent } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { ChildCard } from "@/features/children/child-card";
import { ChildDetailPanel } from "@/features/children/child-detail";
import { ChildFormDialog } from "@/features/children/child-form-dialog";
import { listChildren } from "@/features/children/queries";

export const metadata: Metadata = { title: ka.children.title };

/**
 * P8 — children management.
 *
 * Selection lives in the URL (`?child=<id>`) rather than in component state, so
 * the detail panel is server-rendered and a reload keeps the same child open.
 */
export default async function ParentChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Page-level guard; the layout does it too, but a page must not rely on that.
  await requireParent();

  const { child: requestedId } = await searchParams;
  const children = await listChildren();

  const selectedId = typeof requestedId === "string" ? requestedId : null;
  const selected =
    children.find((child) => child.id === selectedId) ??
    children.find((child) => child.isActive) ??
    children[0] ??
    null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ka.children.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ka.children.subtitle}
          </p>
        </div>
        <ChildFormDialog />
      </header>

      {children.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{ka.children.empty}</CardTitle>
          </CardHeader>
          <CardContent className="grid justify-items-start gap-4">
            <p className="text-sm text-muted-foreground">
              {ka.children.emptyHint}
            </p>
            <ChildFormDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {children.map((child) => (
              <ChildCard
                key={child.id}
                child={child}
                selected={child.id === selected?.id}
              />
            ))}
          </div>

          {selected ? (
            <section className="grid gap-4">
              <h2 className="text-lg font-semibold">
                {selected.name} · {ka.children.accessTitle}
              </h2>
              <ChildDetailPanel child={selected} />
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              {ka.children.selectHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
