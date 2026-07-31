import type { NextRequest } from "next/server";
import { getSnapshot, subscribe } from "@/lib/store";
import type { BoothSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

// プロキシ・OS のアイドルタイムアウトで接続が切られないよう、定期的に
// コメント行(イベントとして扱われない `:` 始まりの行)を送る。
const PING_INTERVAL_MS = 15_000;

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (snapshot: BoothSnapshot) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pingTimer) clearInterval(pingTimer);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // すでにクローズ済みの場合は無視する。
        }
      };

      // 接続直後に現在のスナップショットを送る。
      send(getSnapshot());

      unsubscribe = subscribe(send);

      pingTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, PING_INTERVAL_MS);

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
