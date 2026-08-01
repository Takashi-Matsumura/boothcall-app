"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CheckSquare, RotateCcw, Square, Trash2 } from "lucide-react";
import { useBoothState } from "@/components/use-booth-state";
import { ConnectionBadge } from "@/components/connection-badge";
import { ReaderBadge } from "@/components/reader-badge";
import { ScanPanel } from "@/components/scan-panel";
import { TicketNumber } from "@/components/ticket-number";
import { UndoToastStack, type PendingDeleteToast } from "@/components/undo-toast";
import { MENU_ITEMS, menuItemLabel, type MenuItemId } from "@/lib/menu";
import {
  formatCardIdShort,
  formatTicketNumber,
  type BoothSnapshot,
  type CardRegistration,
  type LastScan,
  type Ticket,
  type TicketActionRequest,
} from "@/lib/types";

const UNDO_WINDOW_MS = 6000;
const TOAST_EXIT_MS = 300;
const SCAN_AUTO_DISMISS_MS = 30_000;
const BOUND_MESSAGE_VISIBLE_MS = 4000;
const HIGHLIGHT_DURATION_MS = 2400;
const ACTION_ERROR_VISIBLE_MS = 5000;

// md 以上ではページ全体ではなく各カラム(レーン)の内部だけをスクロールさせる。
// -mx-1.5/px-1.5 は overflow-y-auto が誘発する意図しない水平スクロールバーを、
// カードロケートハイライトの ring-offset のためのゆとりで吸収するための余白。
const COLUMN_LANE =
  "-mx-1.5 flex min-h-0 flex-1 flex-col gap-2 px-1.5 scrollbar-thin " +
  "scrollbar-thumb-rule-2 scrollbar-gutter-stable md:overflow-x-clip md:overflow-y-auto md:overscroll-contain";

const ERROR_MESSAGE: Record<string, string> = {
  meishi_required: "名刺を受け取ってから渡済みにできます",
  card_reissued: "このカードは別の注文に再発行済みのため取り消せません",
  invalid_transition: "状態が変わりました。画面を確認してください",
  not_found: "このチケットは既に削除されています",
};

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

type FreshScanTracking = {
  lastSnapshot: BoothSnapshot | null;
  hasBaseline: boolean;
  seenScanId: number;
  fresh: LastScan | null;
};

const INITIAL_SCAN_TRACKING: FreshScanTracking = {
  lastSnapshot: null,
  hasBaseline: false,
  seenScanId: 0,
  fresh: null,
};

/**
 * スナップショットの lastScan から「新規タップ」だけを取り出す。
 * 初回受信したスナップショットを基準点とし、それ以前に乗っていた lastScan は
 * 「今タップされたもの」として扱わない(/display のチャイム判定と同じ考え方)。
 *
 * effect ではなく「レンダー中に state を調整する」React 公式パターンで実装する
 * (snapshot は props 相当であり、その変化に応じて state を同期する処理は
 * `useEffect` 内で直接 setState するより、レンダー中の比較・更新の方が適切)。
 */
function useFreshScan(snapshot: BoothSnapshot | null): LastScan | null {
  const [tracking, setTracking] = useState(INITIAL_SCAN_TRACKING);

  if (snapshot && snapshot !== tracking.lastSnapshot) {
    const scan = snapshot.lastScan;

    if (!tracking.hasBaseline) {
      setTracking({
        lastSnapshot: snapshot,
        hasBaseline: true,
        seenScanId: scan?.scanId ?? 0,
        fresh: null,
      });
    } else if (!scan) {
      setTracking({ ...tracking, lastSnapshot: snapshot, fresh: null });
    } else if (scan.scanId > tracking.seenScanId) {
      setTracking({
        lastSnapshot: snapshot,
        hasBaseline: true,
        seenScanId: scan.scanId,
        fresh: scan,
      });
    } else {
      setTracking({ ...tracking, lastSnapshot: snapshot });
    }
  }

  return tracking.fresh;
}

async function postAction(
  id: string,
  request: TicketActionRequest,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => null);
  return { ok: false, reason: (data?.reason as string) ?? "unknown" };
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
  highlighted,
  errorMessage,
  onAction,
  onDelete,
  ref,
}: {
  ticket: Ticket;
  now: number;
  disabled: boolean;
  highlighted: boolean;
  errorMessage?: string;
  onAction: (request: TicketActionRequest) => void;
  onDelete?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const meishiBlocked = ticket.status === "CALLING" && !ticket.meishiReceived;
  // COMPLETED(渡し終えた注文)は中身を書き換えると集計が実態とずれるため訂正不可
  // (サーバ側 applyAction の "set-item" ガードと対称)。
  const itemEditable = ticket.status !== "COMPLETED";
  const [itemMenuOpen, setItemMenuOpen] = useState(false);

  return (
    <div
      ref={ref}
      className={`relative flex flex-col gap-2 overflow-hidden rounded-card border p-3 ${
        ticket.status === "COMPLETED" && ticket.skipped
          ? "border-danger/40 bg-danger/10"
          : "border-rule bg-paper-2"
      } ${highlighted ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""}`}
    >
      {highlighted && (
        <span
          aria-hidden
          className="animate-card-locate pointer-events-none absolute inset-0 rounded-card bg-accent/12"
        />
      )}

      <div className="flex flex-wrap items-baseline gap-3">
        <TicketNumber number={ticket.number} className="text-3xl text-ink" />
        {itemEditable ? (
          <button
            type="button"
            aria-expanded={itemMenuOpen}
            disabled={disabled}
            onClick={() => setItemMenuOpen((v) => !v)}
            className="min-h-11 whitespace-nowrap rounded-card border border-rule-2 bg-transparent px-2.5 py-1 text-sm font-semibold text-ink-2 transition-colors duration-[264ms] ease-out hover:bg-paper-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {menuItemLabel(ticket.item)}
          </button>
        ) : (
          <span className="text-sm font-semibold text-ink-2">
            {menuItemLabel(ticket.item)}
          </span>
        )}
        <span
          className="font-outlier text-[11px] text-muted"
          title={ticket.cardId}
        >
          {formatCardIdShort(ticket.cardId)}
        </span>
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

      {itemEditable && itemMenuOpen && (
        <div className="flex flex-wrap gap-1.5">
          {MENU_ITEMS.map((menuItem) => (
            <button
              key={menuItem.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                onAction({ action: "set-item", item: menuItem.id });
                setItemMenuOpen(false);
              }}
              className={`min-h-11 whitespace-nowrap rounded-card px-3 py-1.5 text-xs font-semibold transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${
                ticket.item === menuItem.id
                  ? "border border-accent/40 bg-accent/12 text-accent"
                  : "border border-rule-2 bg-transparent text-ink-2 hover:bg-paper-2"
              }`}
            >
              {menuItem.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {ticket.status !== "COMPLETED" ? (
          <button
            type="button"
            aria-pressed={ticket.meishiReceived}
            disabled={disabled}
            onClick={() =>
              onAction({
                action: ticket.meishiReceived ? "meishi-off" : "meishi-on",
              })
            }
            className={`mr-auto inline-flex min-h-11 items-center gap-1.5 rounded-card px-3 py-2 text-sm font-semibold transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${
              ticket.meishiReceived
                ? "border border-accent/40 bg-accent/12 text-accent"
                : "border border-rule-2 bg-transparent text-ink-2 hover:bg-paper-2"
            }`}
          >
            {ticket.meishiReceived ? (
              <CheckSquare size={16} />
            ) : (
              <Square size={16} />
            )}
            {ticket.meishiReceived ? "名刺 受取済" : "名刺 未受取"}
          </button>
        ) : (
          <span className="mr-auto text-xs text-muted">
            {ticket.meishiReceived ? "名刺 受取済" : "名刺 未受取"}
          </span>
        )}

        {ticket.status === "PREPARING" && (
          <>
            <ActionButton
              label="呼び出す"
              tone="primary"
              disabled={disabled}
              onClick={() => onAction({ action: "call" })}
            />
            <ActionButton
              label="スキップ"
              disabled={disabled}
              onClick={() => onAction({ action: "skip" })}
            />
          </>
        )}
        {ticket.status === "CALLING" && (
          <>
            <ActionButton
              label="渡済み"
              tone="primary"
              disabled={disabled || meishiBlocked}
              onClick={() => onAction({ action: "complete" })}
            />
            <ActionButton
              label="スキップ"
              disabled={disabled}
              onClick={() => onAction({ action: "skip" })}
            />
            <ActionButton
              label="準備中に戻す"
              disabled={disabled}
              onClick={() => onAction({ action: "revert" })}
            />
          </>
        )}
        {ticket.status === "COMPLETED" && (
          <ActionButton
            label="取り消し"
            disabled={disabled}
            onClick={() => onAction({ action: "revert" })}
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

        {meishiBlocked && (
          <p className="basis-full text-right text-xs text-muted">
            名刺を受け取ってから渡済みにできます
          </p>
        )}
        {errorMessage && (
          <p className="basis-full text-right text-xs text-danger">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const {
    snapshot,
    connected,
    preparing,
    calling,
    completed,
    readerStatus,
  } = useBoothState();
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

  const [actionErrors, setActionErrors] = useState<Map<string, string>>(
    new Map(),
  );
  const actionErrorTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const cardRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [highlightScanId, setHighlightScanId] = useState<number | null>(null);

  const [scanVisible, setScanVisible] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPending, startScanTransition] = useTransition();
  const [handledScanId, setHandledScanId] = useState<number | null>(null);

  const [registeredCards, setRegisteredCards] = useState<CardRegistration[]>(
    [],
  );

  const freshScan = useFreshScan(snapshot);

  // 新規スキャンが来るたびに表示をリセットする(レンダー中に調整するパターン。
  // タイマー登録・掃除は下の useEffect 側で行う)。
  if ((freshScan?.scanId ?? null) !== handledScanId) {
    setHandledScanId(freshScan?.scanId ?? null);
    setScanVisible(true);
    setScanError(null);
  }

  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  // アンマウント時に保留中のタイマーを掃除する。
  useEffect(() => {
    const deleteTimers = deleteTimersRef.current;
    const errorTimers = actionErrorTimersRef.current;
    return () => {
      deleteTimers.forEach((timer) => clearTimeout(timer));
      errorTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // 「紐付き済み」メッセージは数秒で自動的に消す
  // (既に対応するカードは下のカンバンでハイライトされる)。
  useEffect(() => {
    if (freshScan?.outcome !== "bound") return;
    const timer = setTimeout(() => setScanVisible(false), BOUND_MESSAGE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [freshScan?.scanId, freshScan?.outcome]);

  // 未紐付けカードの発行プロンプトは 30 秒でサーバ側から自動破棄する
  // (リロード後に古いプロンプトが復活しないように)。
  useEffect(() => {
    if (freshScan?.outcome !== "unbound") return;
    const timer = setTimeout(() => {
      void fetch("/api/nfc/scan", { method: "DELETE" });
    }, SCAN_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [freshScan?.scanId, freshScan?.outcome]);

  // 既存チケットに紐づいたカードのタップ: 対応するカードへスクロール(純粋な DOM 操作
  // のみを行う effect。setState はここでは呼ばない)。
  useEffect(() => {
    if (freshScan?.outcome !== "bound" || !freshScan.ticketId) return;
    const el = cardRefsRef.current.get(freshScan.ticketId);
    if (!el) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [freshScan]);

  // ハイライト対象は「レンダー中に調整する」パターンで設定する
  // (highlightScanId state の宣言はコンポーネント冒頭にまとめてある)。
  if (
    freshScan?.outcome === "bound" &&
    freshScan.ticketId &&
    freshScan.scanId !== highlightScanId
  ) {
    setHighlightScanId(freshScan.scanId);
    setHighlightedId(freshScan.ticketId);
  }

  // ハイライトの自動解除タイマー。setState はタイマーのコールバック内でのみ呼ぶ。
  useEffect(() => {
    if (highlightedId === null) return;
    const timer = setTimeout(() => {
      setHighlightedId(null);
    }, HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlightedId, highlightScanId]);

  const setCardRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) cardRefsRef.current.set(id, el);
      else cardRefsRef.current.delete(id);
    },
    [],
  );

  const showActionError = (id: string, reason: string) => {
    setActionErrors((prev) => {
      const next = new Map(prev);
      next.set(id, ERROR_MESSAGE[reason] ?? "操作に失敗しました");
      return next;
    });
    const prevTimer = actionErrorTimersRef.current.get(id);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      setActionErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      actionErrorTimersRef.current.delete(id);
    }, ACTION_ERROR_VISIBLE_MS);
    actionErrorTimersRef.current.set(id, timer);
  };

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

  const handleAction = (id: string, request: TicketActionRequest) => {
    withPending(id, async () => {
      const result = await postAction(id, request);
      if (!result.ok) showActionError(id, result.reason);
    });
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

  const handleIssueFromScan = (item: MenuItemId) => {
    if (!freshScan || freshScan.outcome !== "unbound") return;
    setScanError(null);
    startScanTransition(async () => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: freshScan.cardId, item }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setScanError(data?.error ?? "発行に失敗しました");
      }
      // 成功時はストアが lastScan を消費して null にするので、SSE 経由で
      // パネルは自動的に Idle に戻る。
    });
  };

  const handleDismissScan = () => {
    setScanError(null);
    void fetch("/api/nfc/scan", { method: "DELETE" });
  };

  const handleRegisterCard = () => {
    if (!freshScan || freshScan.outcome !== "unregistered") return;
    setScanError(null);
    startScanTransition(async () => {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: freshScan.cardId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setScanError(data?.error ?? "登録に失敗しました");
      }
      // 成功時はサーバ側で lastScan を消費するので、SSE 経由でパネルは
      // 自動的に Idle に戻る(handleIssueFromScan と同じ考え方)。
    });
  };

  const handleRegistryToggle = (
    event: React.SyntheticEvent<HTMLDetailsElement>,
  ) => {
    if (!event.currentTarget.open) return;
    void fetch("/api/cards")
      .then((res) => res.json())
      .then((data: { cards?: CardRegistration[] }) => {
        setRegisteredCards(data.cards ?? []);
      });
  };

  const handleRemoveCard = (cardId: string) => {
    void fetch(`/api/cards/${cardId}`, { method: "DELETE" }).then(() => {
      setRegisteredCards((prev) => prev.filter((c) => c.cardId !== cardId));
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

  const renderCard = (ticket: Ticket, withDelete: boolean) => (
    <TicketCard
      key={ticket.id}
      ref={setCardRef(ticket.id)}
      ticket={ticket}
      now={now}
      disabled={pendingIds.has(ticket.id)}
      highlighted={highlightedId === ticket.id}
      errorMessage={actionErrors.get(ticket.id)}
      onAction={(request) => handleAction(ticket.id, request)}
      onDelete={withDelete ? () => handleDelete(ticket) : undefined}
    />
  );

  const orderTally = snapshot?.orderTally ?? [];
  const totalOrdered = orderTally.reduce((sum, entry) => sum + entry.ordered, 0);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:h-dvh md:overflow-hidden">
      {/* md 未満: 1カラム積み上げでページ自体がスクロールするため、操作の起点
          (ヘッダー+スキャンパネル)を画面上部に固定する。
          md 以上: ページは h-dvh で非スクロールの chrome になるため static に戻す。 */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 flex shrink-0 flex-col gap-4 border-b border-rule bg-paper px-4 pt-4 pb-4 sm:-mx-6 sm:px-6 md:static md:m-0 md:border-b-0 md:p-0">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-ink">
            BoothCall スタッフ操作
          </h1>
          <div className="flex items-center gap-3">
            <ReaderBadge status={readerStatus} />
            <ConnectionBadge connected={connected} />
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-sm font-medium transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${
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

        <ScanPanel
          readerStatus={readerStatus}
          scan={scanVisible ? freshScan : null}
          registeredCardCount={snapshot?.registeredCardCount ?? 0}
          pending={scanPending}
          error={scanError}
          onIssue={handleIssueFromScan}
          onRegister={handleRegisterCard}
          onDismiss={handleDismissScan}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <details
          className="w-full shrink-0 rounded-card border border-rule bg-paper-2 open:pb-2 sm:w-auto sm:flex-1 sm:basis-64"
          onToggle={handleRegistryToggle}
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-2">
            登録済みカード ({snapshot?.registeredCardCount ?? 0} 枚)
          </summary>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto px-3 scrollbar-thin scrollbar-thumb-rule-2">
            {registeredCards.length === 0 && (
              <p className="text-sm text-muted">登録済みのカードはありません</p>
            )}
            {registeredCards.map((card) => (
              <div
                key={card.cardId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-outlier tabular-nums text-ink">
                  {formatTicketNumber(card.number)}
                </span>
                <span
                  className="font-outlier text-xs text-muted"
                  title={card.cardId}
                >
                  {formatCardIdShort(card.cardId)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveCard(card.cardId)}
                  aria-label={`${formatTicketNumber(card.number)} の登録を取り消す`}
                  className="grid min-h-11 min-w-11 place-items-center rounded-card text-muted transition-colors duration-[264ms] ease-out hover:bg-danger/15 hover:text-danger active:translate-y-px"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </details>

        <details className="w-full shrink-0 rounded-card border border-rule bg-paper-2 open:pb-2 sm:w-auto sm:flex-1 sm:basis-64">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-2">
            注文集計 (合計 {totalOrdered} 杯)
          </summary>
          <div className="flex flex-col gap-1 px-3 text-sm">
            {orderTally.map((entry) => (
              <div
                key={entry.item}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-ink-2">{menuItemLabel(entry.item)}</span>
                <span className="font-outlier tabular-nums text-muted">
                  注文 {entry.ordered} 杯 / 渡済み {entry.served} 杯
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-4 md:flex-1 md:grid-cols-3 md:grid-rows-1">
        <section className="flex min-h-0 flex-col gap-2">
          <h2 className="shrink-0 font-display text-sm tracking-wide text-muted">
            準備中 ({visiblePreparing.length})
          </h2>
          <div className={COLUMN_LANE}>
            {visiblePreparing.length === 0 && (
              <p className="text-sm text-muted">なし</p>
            )}
            {visiblePreparing.map((ticket) => renderCard(ticket, true))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-2">
          <h2 className="shrink-0 font-display text-sm tracking-wide text-muted">
            呼び出し中 ({visibleCalling.length})
          </h2>
          <div className={COLUMN_LANE}>
            {visibleCalling.length === 0 && (
              <p className="text-sm text-muted">なし</p>
            )}
            {visibleCalling.map((ticket) => renderCard(ticket, true))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-2">
          <h2 className="shrink-0 font-display text-sm tracking-wide text-muted">
            完了(直近)
          </h2>
          <div className={COLUMN_LANE}>
            {visibleCompleted.length === 0 && (
              <p className="text-sm text-muted">なし</p>
            )}
            {visibleCompleted.map((ticket) => renderCard(ticket, false))}
          </div>
        </section>
      </div>

      <UndoToastStack toasts={toasts} onUndo={handleUndoDelete} />
    </div>
  );
}
