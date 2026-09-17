import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAssignmentEditorData } from "@/features/assignments/queries";
import { ka } from "@/lib/i18n/ka";

import { AssignmentForm } from "../assignment-form";

export const metadata: Metadata = { title: ka.assignments.newTitle };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const childParam = params.child;
  const defaultChildId =
    typeof childParam === "string" ? childParam : (childParam?.[0] ?? null);

  const data = await getAssignmentEditorData(null);
  if (!data) notFound();

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <Button asChild variant="ghost" size="sm" className="justify-self-start">
          <Link href="/parent/assignments">
            <ChevronLeft />
            {ka.common.back}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.assignments.newTitle}
        </h1>
      </header>

      {data.children.length === 0 ? (
        <Card>
          <CardContent className="grid gap-3 py-10 text-center">
            <p className="font-medium">{ka.parent.noChildren}</p>
            <Button asChild variant="outline" className="justify-self-center">
              <Link href="/parent/children">{ka.parent.addChild}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AssignmentForm data={data} defaultChildId={defaultChildId} />
      )}
    </div>
  );
}
