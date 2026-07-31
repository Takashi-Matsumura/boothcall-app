"use client";

import { useEffect, useRef, useState } from "react";
import { useBoothState } from "@/components/use-booth-state";
import { useChime } from "@/components/use-chime";
import { ConnectionBadge } from "@/components/connection-badge";
import { SoundToggle } from "@/components/sound-toggle";
import { TicketNumber } from "@/components/ticket-number";

const MAX_PREPARING_VISIBLE = 12;

function useClock() {
  // 時計は呼ぶたびに値が変わるため useSyncExternalStore には適さない
  // (getSnapshot は「変化がなければ同じ値」を返す契約を前提とする)。
  // サーバとの hydration 不一致を避けるため初期値は null にし、
  // 実時刻は最初の tick(最大1秒後)から反映する。
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;

    const requestLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          sentinel = await navigator.wakeLock.request("screen");
        }
      } catch {
        // 未対応・失敗時は何もしない(サイネージ機能自体は継続する)。
      }
    };

    void requestLock();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
    };
  }, []);
}

export default function DisplayPage() {
  const { snapshot, connected, preparing, calling } = useBoothState();
  const { enabled: chimeEnabled, toggle: toggleChime, play } = useChime();
  const now = useClock();
  useWakeLock();

  const knownCallingRef = useRef<Set<string>>(new Set());
  const hasBaselineRef = useRef(false);

  useEffect(() => {
    // まだ一度もサーバからスナップショットを受け取っていない(=接続前)は判定しない。
    if (!snapshot) return;

    const knownIds = knownCallingRef.current;
    const currentIds = new Set(calling.map((t) => t.id));

    // 初めてスナップショットを受け取った時点(ページ読込直後の状態)は基準として
    // 記録するだけで、既存の CALLING に対して鳴らさない。
    if (hasBaselineRef.current) {
      const hasNewCall = calling.some((t) => !knownIds.has(t.id));
      if (hasNewCall) play();
    }

    knownCallingRef.current = currentIds;
    hasBaselineRef.current = true;
  }, [snapshot, calling, play]);

  const hero = calling[0];
  const rest = calling.slice(1);
  const hiddenPreparingCount = Math.max(
    0,
    preparing.length - MAX_PREPARING_VISIBLE,
  );

  return (
    <div className="theme-dark flex h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-rule px-6 py-3">
        <h1 className="font-display text-xl tracking-wide text-ink-2">
          BoothCall
        </h1>
        <div className="flex items-center gap-3">
          <span className="font-outlier text-lg tabular-nums text-muted">
            {now
              ? now.toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--:--"}
          </span>
          <SoundToggle enabled={chimeEnabled} onToggle={toggleChime} />
          <ConnectionBadge connected={connected} />
        </div>
      </header>

      {/* Hallmark note: this hero figure is the one disclosed exception to the
          accent-restraint rule (design.md § Deliberate exception) — a booth
          queue display's entire job is to be unmissable from across a room. */}
      <section className="flex flex-[2] flex-col items-center justify-center gap-6 overflow-hidden px-6 py-4">
        <p
          className={`font-display text-2xl tracking-[0.2em] sm:text-3xl ${
            hero ? "animate-blink text-accent-2" : "text-muted"
          }`}
        >
          呼び出し中
        </p>

        {hero ? (
          <div
            key={hero.id}
            className="animate-call-pulse text-[clamp(8rem,32vw,18rem)] leading-none text-accent-2 [overflow-wrap:anywhere] [min-width:0]"
          >
            <TicketNumber number={hero.number} />
          </div>
        ) : (
          <p className="font-display text-2xl text-muted">
            ただいまお呼び出しはありません
          </p>
        )}

        {rest.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
            {rest.map((ticket) => (
              <div
                key={ticket.id}
                className="animate-call-in text-7xl text-accent-2/80 sm:text-8xl"
              >
                <TicketNumber number={ticket.number} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-1 flex-col gap-3 overflow-hidden border-t border-rule bg-paper-2 px-6 py-4">
        <p className="font-display text-lg tracking-[0.14em] text-muted">
          準備中
        </p>
        {preparing.length === 0 ? (
          <p className="text-lg text-muted">現在準備中の番号はありません</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {preparing.slice(0, MAX_PREPARING_VISIBLE).map((ticket) => (
              <div key={ticket.id} className="text-5xl text-ink-2 sm:text-6xl">
                <TicketNumber number={ticket.number} />
              </div>
            ))}
            {hiddenPreparingCount > 0 && (
              <div className="text-3xl text-muted">
                他 {hiddenPreparingCount} 件
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
