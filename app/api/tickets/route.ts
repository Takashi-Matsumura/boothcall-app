import { NextResponse, type NextRequest } from "next/server";
import { getSnapshot, issueTicket } from "@/lib/store";
import { isMenuItemId } from "@/lib/menu";
import { isValidCardId, normalizeCardId } from "@/lib/types";

export const dynamic = "force-dynamic";

// ポーリングフォールバック用のスナップショット取得。
export async function GET() {
  return NextResponse.json(getSnapshot());
}

// 新規チケット発行。カード無しのチケットは存在しないため cardId を必須とする。
// 注文品(item)も必須 — チケットは必ず1種類のコーヒーを持つ。
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

  if (!isMenuItemId(body?.item)) {
    return NextResponse.json(
      { error: "item must be a valid menu item id", reason: "invalid_item" },
      { status: 400 },
    );
  }

  const result = issueTicket(cardId, body.item);
  if (!result.ok) {
    if (result.reason === "card_not_registered") {
      return NextResponse.json(
        {
          error: "card is not registered yet",
          reason: "card_not_registered",
        },
        { status: 404 },
      );
    }
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
