import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAssignmentEditorData } from "@/features/assignments/queries";
import { ka } from "@/lib/i18n/ka";

import { AssignmentForm } from "../../assignment-form";
import { DeleteAssignmentButton } from "./delete-button";

export const metadata: Metadata = { title: ka.assignments.editTitle };

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAssignmentEditorData(id);
  if (!data?.assignment) notFound();

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <Button asChild variant="ghost" size="sm" className="justify-self-start">
          <Link href={`/parent/assignments/${id}`}>
            <ChevronLeft />
            {ka.common.back}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.assignments.editTitle}
        </h1>
      </header>

      <AssignmentForm data={data} />

      <div className="max-w-2xl border-t pt-4">
        <DeleteAssignmentButton
          assignmentId={data.assignment.id}
          title={data.assignment.title}
        />
      </div>
    </div>
  );
}
