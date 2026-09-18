import { ChildHistory } from "@/features/children/child-history";
import { requireFamilyChild } from "@/features/children/child-scope";

/** P4 / „ისტორია“ — the last 30 days at a glance. */
export default async function ChildHistoryPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const child = await requireFamilyChild(childId);

  return <ChildHistory childId={child.id} />;
}
