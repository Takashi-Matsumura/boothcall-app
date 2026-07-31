import { NextResponse } from "next/server";
import { getSnapshot, issueTicket } from "@/lib/store";

export const dynamic = "force-dynamic";

// ポーリングフォールバック用のスナップショット取得。
export async function GET() {
  return NextResponse.json(getSnapshot());
}

// 新規チケット発行。
export async function POST() {
  const ticket = issueTicket();
  return NextResponse.json({ ticket, snapshot: getSnapshot() }, { status: 201 });
}
