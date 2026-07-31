import { NextResponse } from "next/server";
import { getSnapshot, resetSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  resetSession();
  return NextResponse.json(getSnapshot());
}
