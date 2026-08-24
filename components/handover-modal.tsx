"use client";

import { useEffect } from "react";
import { TicketNumber } from "@/components/ticket-number";
import { menuItemLabel } from "@/lib/menu";
import { formatCardIdShort, type Ticket } from "@/lib/types";

type HandoverModalProps = {
  /** 呼び出し中チケットへの紐付きタップで開く。null なら非表示。 */
  ticket: Ticket | null;
  pending: boolean;
  error: string | null;
  onComplete: () => void;
  onClose: () => void;
};

/**
 * 呼び出し中のカードをリーダーにかざした際、注文内容を確認した上で
 * 「渡し済みにする」操作までこの場で完結させるためのモーダル。
 */
export function HandoverModal({
  ticket,
  pending,
  error,
  onComplete,
  onClose,
}: HandoverModalProps) {
  useEffect(() => {
    if (!ticket) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ticket, onClose]);

  if (!ticket) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="お渡しの確認"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-rule bg-paper px-6 py-6 text-center shadow-lg"
      >
        <p className="text-sm text-muted">呼び出し中のお渡し確認</p>
        <TicketNumber number={ticket.number} className="text-5xl text-ink" />
        <p className="text-base font-semibold text-ink-2">
          {menuItemLabel(ticket.item)}
        </p>
        <p className="font-outlier text-xs text-muted" title={ticket.cardId}>
          カード {formatCardIdShort(ticket.cardId)}
        </p>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="mt-2 flex w-full gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-11 flex-1 whitespace-nowrap rounded-card border border-rule-2 bg-transparent px-4 py-2 text-sm font-semibold text-ink-2 transition-colors duration-[264ms] ease-out hover:bg-paper-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={pending}
            className="min-h-11 flex-1 whitespace-nowrap rounded-card bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            渡し済みにする
          </button>
        </div>
      </div>
    </div>
  );
}
