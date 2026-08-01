import { NextResponse, type NextRequest } from "next/server";
import {
  reassignCardNumber,
  removeCardRegistration,
} from "@/lib/card-registry";
import { normalizeCardId } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ cardId: string }> };

// 誤登録の取り消し用。まだシールを貼っていない直近の登録であれば、
// 欠番を作らないよう採番カウンタも戻る(lib/card-registry.ts 参照)。
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { cardId } = await params;
  const removed = removeCardRegistration(normalizeCardId(cardId));

  if (!removed) {
    return NextResponse.json({ error: "card not registered" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// カード破損・紛失時に、同じ恒久番号を新しい物理カードへ引き継がせる。
// 現時点では管理画面にUIを持たず、必要になった場合にAPIとして直接呼び出す運用。
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { cardId } = await params;
  const body = await request.json().catch(() => null);
  const newCardId = normalizeCardId(
    typeof body?.newCardId === "string" ? body.newCardId : "",
  );

  if (!newCardId) {
    return NextResponse.json(
      { error: "newCardId must be a hex IDm string" },
      { status: 400 },
    );
  }

  const result = reassignCardNumber(normalizeCardId(cardId), newCardId);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ number: result.number });
}
