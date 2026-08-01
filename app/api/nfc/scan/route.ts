import { NextResponse, type NextRequest } from "next/server";
import { guardMutatingRequest } from "@/lib/request-guard";
import { clearLastScan, getSnapshot, recordScan } from "@/lib/store";
import { isValidCardId, normalizeCardId } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 開発専用: 実機の RC-S300 が無い環境でカードタップを再現するテスト用エンドポイント。
 * 本番ビルドでは 404 を返し、存在しないものとして振る舞う。UI から呼び出すことはない
 * (実際のタップは lib/nfc-reader.ts がサーバ内から直接 recordScan() を呼ぶ)。
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const rejected = guardMutatingRequest(request);
  if (rejected) return rejected;

  const body = await request.json().catch(() => null);
  const raw = typeof body?.cardId === "string" ? body.cardId : "";
  const cardId = normalizeCardId(raw);

  if (!isValidCardId(cardId)) {
    return NextResponse.json(
      { error: "cardId must be a hex IDm string" },
      { status: 400 },
    );
  }

  return NextResponse.json({ scan: recordScan(cardId), snapshot: getSnapshot() });
}

// 本番でも使用: 未処理のスキャン候補を破棄する(発行キャンセル・自動失効用)。
export async function DELETE(request: NextRequest) {
  const rejected = guardMutatingRequest(request);
  if (rejected) return rejected;

  clearLastScan();
  return NextResponse.json({ snapshot: getSnapshot() });
}
