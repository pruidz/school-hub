import type { NextRequest } from "next/server";

import { switchChildAndRedirect } from "@/features/children/switch-child-route";

/** P4's „რეპორტი“ tab: make this child active, then hand over to P7. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  const { childId } = await params;
  return switchChildAndRedirect(request, childId, "/parent/reports");
}
