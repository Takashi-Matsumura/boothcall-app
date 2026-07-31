"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useBoothState } from "@/components/use-booth-state";
import { ConnectionBadge } from "@/components/connection-badge";
import { TicketNumber } from "@/components/ticket-number";
import { UndoToastStack, type PendingDeleteToast } from "@/components/undo-toast";
import { formatTicketNumber, type Ticket, type TicketAction } from "@/lib/types";

const UNDO_WINDOW_MS = 6000;
const TOAST_EXIT_MS = 300;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function elapsedLabel(fromMs: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  return `${hours}時間前`;
}

async function postAction(id: string, action: TicketAction) {
  await fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "secondary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-accent text-accent-ink hover:brightness-105"
      : "border border-rule-2 bg-transparent text-ink-2 hover:bg-paper-2";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 whitespace-nowrap rounded-card px-3 py-2 text-sm font-semibold transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {label}
    </button>
  );
}

function TicketCard({
  ticket,
  now,
  disabled,
  onAction,
  onDelete,
}: {
  ticket: Ticket;
  now: number;
  disabled: boolean;
  onAction: (action: TicketAction) => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-card border p-3 ${
        ticket.status === "COMPLETED" && ticket.skipped
          ? "border-danger/40 bg-danger/10"
          : "border-rule bg-paper-2"
      }`}
    >
      <div className="flex items-baseline gap-3">
        <TicketNumber number={ticket.number} className="text-3xl text-ink" />
        <span className="text-xs text-muted">
          {elapsedLabel(
            ticket.status === "CALLING" && ticket.calledAt
              ? ticket.calledAt
              : ticket.createdAt,
            now,
          )}
        </span>
        {ticket.status === "COMPLETED" && ticket.skipped && (
          <span className="text-xs font-semibold text-danger">スキップ</span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {ticket.status === "PREPARING" && (
          <>
            <ActionButton
              label="呼び出す"
              tone="primary"
              disabled={disabled}
              onClick={() => onAction("call")}
            />
            <ActionButton
              label="スキップ"
              disabled={disabled}
              onClick={() => onAction("skip")}
            />
          </>
        )}
        {ticket.status === "CALLING" && (
          <>
            <ActionButton
              label="渡済み"
              tone="primary"
              disabled={disabled}
              onClick={() => onAction("complete")}
            />
            <ActionButton
              label="スキップ"
              disabled={disabled}
              onClick={() => onAction("skip")}
            />
            <ActionButton
              label="準備中に戻す"
              disabled={disabled}
              onClick={() => onAction("revert")}
            />
          </>
        )}
        {ticket.status === "COMPLETED" && (
          <ActionButton
            label="取り消し"
            disabled={disabled}
            onClick={() => onAction("revert")}
          />
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            aria-label="削除"
            className="grid min-h-11 min-w-11 place-items-center rounded-card text-muted transition-colors duration-[264ms] ease-out hover:bg-danger/15 hover:text-danger active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { snapshot, connected, preparing, calling, completed } =
    useBoothState();
  const now = useNow();
  const [isPending, startTransition] = useTransition();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [resetArmed, setResetArmed] = useState(false);

  const [pendingDeletes, setPendingDeletes] = useState<
    Map<string, { ticketNumber: number; closing: boolean }>
  >(new Map());
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  // アンマウント時に保留中の削除タイマーを掃除する。
  useEffect(() => {
    const timers = deleteTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const withPending = (id: string, fn: () => Promise<void>) => {
    setPendingIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  };

  const handleIssue = () => {
    startTransition(async () => {
      await fetch("/api/tickets", { method: "POST" });
    });
  };

  const handleAction = (id: string, action: TicketAction) => {
    withPending(id, () => postAction(id, action));
  };

  // 楽観的な削除: 即座に画面から隠し、Undo トーストを出す。
  // 猶予時間が過ぎてから実際に DELETE を送る(Undo されれば送らない)。
  const handleDelete = (ticket: Ticket) => {
    setPendingDeletes((prev) => {
      const next = new Map(prev);
      next.set(ticket.id, { ticketNumber: ticket.number, closing: false });
      return next;
    });

    const timer = setTimeout(() => {
      setPendingDeletes((prev) => {
        const next = new Map(prev);
        const entry = next.get(ticket.id);
        if (entry) next.set(ticket.id, { ...entry, closing: true });
        return next;
      });

      void fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });

      setTimeout(() => {
        setPendingDeletes((prev) => {
          const next = new Map(prev);
          next.delete(ticket.id);
          return next;
        });
        deleteTimersRef.current.delete(ticket.id);
      }, TOAST_EXIT_MS);
    }, UNDO_WINDOW_MS);

    deleteTimersRef.current.set(ticket.id, timer);
  };

  const handleUndoDelete = (id: string) => {
    const timer = deleteTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimersRef.current.delete(id);
    setPendingDeletes((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setResetArmed(false);
    startTransition(async () => {
      await fetch("/api/session/reset", { method: "POST" });
    });
  };

  const visiblePreparing = useMemo(
    () => preparing.filter((t) => !pendingDeletes.has(t.id)),
    [preparing, pendingDeletes],
  );
  const visibleCalling = useMemo(
    () => calling.filter((t) => !pendingDeletes.has(t.id)),
    [calling, pendingDeletes],
  );
  const visibleCompleted = useMemo(
    () => completed.filter((t) => !pendingDeletes.has(t.id)),
    [completed, pendingDeletes],
  );

  const toasts: PendingDeleteToast[] = useMemo(
    () =>
      Array.from(pendingDeletes.entries()).map(([id, entry]) => ({
        id,
        ticketNumber: entry.ticketNumber,
        closing: entry.closing,
      })),
    [pendingDeletes],
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">
          BoothCall スタッフ操作
        </h1>
        <div className="flex items-center gap-3">
          <ConnectionBadge connected={connected} />
          <button
            type="button"
            onClick={handleReset}
            className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-sm font-medium transition-colors duration-[264ms] ease-out active:translate-y-px ${
              resetArmed
                ? "bg-danger text-danger-ink"
                : "border border-rule-2 bg-transparent text-ink-2 hover:bg-paper-2"
            }`}
          >
            <RotateCcw size={16} />
            {resetArmed ? "もう一度押すとリセット" : "全リセット"}
          </button>
        </div>
      </header>

      <button
        type="button"
        onClick={handleIssue}
        disabled={isPending}
        className="flex flex-col items-center gap-1 rounded-card bg-accent py-8 text-accent-ink transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="font-display text-lg">新規発行</span>
        <span className="font-outlier text-5xl tabular-nums">
          {snapshot ? formatTicketNumber(snapshot.nextNumber) : "---"}
        </span>
      </button>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-sm tracking-wide text-muted">
            準備中 ({visiblePreparing.length})
          </h2>
          <div className="flex flex-col gap-2">
            {visiblePreparing.length === 0 && (
              <p className="text-sm text-muted">なし</p>
            )}
            {visiblePreparing.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                now={now}
                disabled={pendingIds.has(ticket.id)}
                onAction={(action) => handleAction(ticket.id, action)}
                onDelete={() => handleDelete(ticket)}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-sm tracking-wide text-muted">
            呼び出し中 ({visibleCalling.length})
          </h2>
          <div className="flex flex-col gap-2">
            {visibleCalling.length === 0 && (
              <p className="text-sm text-muted">なし</p>
            )}
            {visibleCalling.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                now={now}
                disabled={pendingIds.has(ticket.id)}
                onAction={(action) => handleAction(ticket.id, action)}
                onDelete={() => handleDelete(ticket)}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-sm tracking-wide text-muted">
            完了(直近)
          </h2>
          <div className="flex flex-col gap-2">
            {visibleCompleted.length === 0 && (
              <p className="text-sm text-muted">なし</p>
            )}
            {visibleCompleted.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                now={now}
                disabled={pendingIds.has(ticket.id)}
                onAction={(action) => handleAction(ticket.id, action)}
              />
            ))}
          </div>
        </section>
      </div>

      <UndoToastStack toasts={toasts} onUndo={handleUndoDelete} />
    </div>
  );
}
