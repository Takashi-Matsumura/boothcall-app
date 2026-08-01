import { NextResponse, type NextRequest } from "next/server";
import { guardMutatingRequest } from "@/lib/request-guard";
import { getSnapshot, resetSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rejected = guardMutatingRequest(request);
  if (rejected) return rejected;

  resetSession();
  return NextResponse.json(getSnapshot());
}
