import { NextResponse, type NextRequest } from "next/server";

// cardId/action/item 程度の小さな JSON しか送らないため、十分な余裕を持たせた上限。
// 巨大なボディでのメモリ消費 DoS を安価に防ぐのが目的で、正当な用途を制限しない。
const MAX_BODY_BYTES = 10_000;

/**
 * ブラウザは Origin ヘッダを JS から偽装・削除できないため、「値が存在するのに
 * 自サーバのオリジンと一致しない」場合だけを疑わしいとみなす。認証を持たない
 * このアプリでは、悪意あるページが管理PCのブラウザ上で自動的に状態変更API
 * (全リセット等)を叩く CSRF 相当の攻撃を防ぐのが目的。
 * ヘッダ自体が無い場合は判定不能として通す — curl や将来のスクリプト連携等、
 * 非ブラウザからの直接呼び出しを壊さないため。
 */
function isSameOrigin(request: NextRequest): boolean {
  const expected = new URL(request.url).origin;

  const origin = request.headers.get("origin");
  if (origin !== null) return origin === expected;

  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false; // 壊れた Referer は疑わしいので拒否する。
    }
  }

  return true;
}

function isBodyTooLarge(request: NextRequest): boolean {
  const length = request.headers.get("content-length");
  if (length === null) return false;
  const bytes = Number(length);
  return Number.isFinite(bytes) && bytes > MAX_BODY_BYTES;
}

/**
 * 状態変更を行うルート(POST/PATCH/DELETE)の先頭で呼ぶ。
 * 拒否すべき場合は Response を返すのでそのまま return する。問題なければ null。
 */
export function guardMutatingRequest(
  request: NextRequest,
): NextResponse | null {
  if (isBodyTooLarge(request)) {
    return NextResponse.json(
      { error: "request body too large" },
      { status: 413 },
    );
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "cross-origin request rejected" },
      { status: 403 },
    );
  }
  return null;
}
