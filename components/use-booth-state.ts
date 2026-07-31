"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoothSnapshot, Ticket } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;

type BoothStateResult = {
  snapshot: BoothSnapshot | null;
  connected: boolean;
  preparing: Ticket[];
  calling: Ticket[];
  completed: Ticket[];
};

export function useBoothState(): BoothStateResult {
  const [snapshot, setSnapshot] = useState<BoothSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const applySnapshot = (next: BoothSnapshot) => {
      if (cancelled) return;
      // SSE とポーリングが同時に動く瞬間があり得るため、古いバージョンは無視する。
      if (next.version < versionRef.current) return;
      versionRef.current = next.version;
      setSnapshot(next);
    };

    const pollOnce = async () => {
      try {
        const res = await fetch("/api/tickets", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as BoothSnapshot;
        applySnapshot(data);
      } catch {
        // 次のポーリングに任せる。
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollOnce();
      pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const source = new EventSource("/api/stream");

    source.onopen = () => {
      if (cancelled) return;
      setConnected(true);
      stopPolling();
    };

    source.onmessage = (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(event.data) as BoothSnapshot;
        applySnapshot(data);
      } catch {
        // 壊れたイベントは無視する。
      }
    };

    source.onerror = () => {
      if (cancelled) return;
      setConnected(false);
      // EventSource 自身も自動再接続を試みるが、その間はポーリングで補う。
      startPolling();
    };

    return () => {
      cancelled = true;
      source.close();
      stopPolling();
    };
  }, []);

  const preparing = useMemo(
    () =>
      snapshot?.tickets.filter((t) => t.status === "PREPARING") ?? [],
    [snapshot],
  );

  const calling = useMemo(
    () =>
      (snapshot?.tickets.filter((t) => t.status === "CALLING") ?? []).sort(
        (a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0),
      ),
    [snapshot],
  );

  const completed = useMemo(
    () =>
      (snapshot?.tickets.filter((t) => t.status === "COMPLETED") ?? []).sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
    [snapshot],
  );

  return { snapshot, connected, preparing, calling, completed };
}
