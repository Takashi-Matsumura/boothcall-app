import { NextResponse, type NextRequest } from "next/server";
import { getSnapshot, issueTicket } from "@/lib/store";
import { isValidCardId, normalizeCardId } from "@/lib/types";

export const dynamic = "force-dynamic";

// ポーリングフォールバック用のスナップショット取得。
export async function GET() {
  return NextResponse.json(getSnapshot());
}

// 新規チケット発行。カード無しのチケットは存在しないため cardId を必須とする。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.cardId === "string" ? body.cardId : "";
  const cardId = normalizeCardId(raw);

  if (!isValidCardId(cardId)) {
    return NextResponse.json(
      { error: "cardId must be a hex IDm string", reason: "invalid_card_id" },
      { status: 400 },
    );
  }

  const result = issueTicket(cardId);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: `card already bound to ticket ${result.ticket.number}`,
        reason: "card_in_use",
        ticket: result.ticket,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { ticket: result.ticket, snapshot: getSnapshot() },
    { status: 201 },
  );
}
