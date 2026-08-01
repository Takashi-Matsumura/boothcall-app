import { NextResponse, type NextRequest } from "next/server";
import { listRegisteredCards, registerCard } from "@/lib/card-registry";
import { clearLastScan } from "@/lib/store";
import { isValidCardId, normalizeCardId } from "@/lib/types";

export const dynamic = "force-dynamic";

// 登録済みカード一覧(管理画面の折りたたみ表示用。オンデマンド取得でよいので
// SSE には乗せない)。
export async function GET() {
  return NextResponse.json({ cards: listRegisteredCards() });
}

// カードへ恒久番号を割り当てる(映画館の半券方式)。冪等 — 登録済みカードを
// 再度登録しようとした場合は既存の番号をそのまま返す。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.cardId === "string" ? body.cardId : "";
  const cardId = normalizeCardId(raw);

  if (!isValidCardId(cardId)) {
    return NextResponse.json(
      { error: "cardId must be a hex IDm string" },
      { status: 400 },
    );
  }

  const result = registerCard(cardId);
  // このタップに由来する未登録プロンプトは消費済みなので、issueTicket と同様に
  // lastScan をクリアして SSE 経由でパネルを Idle に戻す。
  clearLastScan();
  return NextResponse.json(result, { status: 200 });
}
