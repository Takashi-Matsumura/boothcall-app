"use client";

import { Nfc } from "lucide-react";
import { TicketNumber } from "@/components/ticket-number";
import { MENU_ITEMS, type MenuItemId } from "@/lib/menu";
import {
  formatCardIdShort,
  formatTicketNumber,
  type LastScan,
  type ReaderStatus,
} from "@/lib/types";

type ScanPanelProps = {
  readerStatus: ReaderStatus;
  /** 「新規」判定済みのスキャンのみを渡す(古いスキャンは呼び出し側でフィルタ済み)。 */
  scan: LastScan | null;
  /** 登録済みカード枚数(アイドル時の進捗表示用)。 */
  registeredCardCount: number;
  pending: boolean;
  error: string | null;
  onIssue: (item: MenuItemId) => void;
  onRegister: () => void;
  onDismiss: () => void;
};

// py-* は状態ごとに個別指定する(同一詳細度の Tailwind ユーティリティは
// クラス文字列中の記述順ではなくスタイルシート内の定義順で解決されるため、
// 共通ベース + 上書きの重ね書きは信頼できない)。
const PANEL_BASE = "flex shrink-0 flex-col items-center gap-2 rounded-card px-6 text-center";

export function ScanPanel({
  readerStatus,
  scan,
  registeredCardCount,
  pending,
  error,
  onIssue,
  onRegister,
  onDismiss,
}: ScanPanelProps) {
  // 未登録カードの検出: 恒久番号の登録確定待ち(発行とは別の操作)。
  // 「登録する」と「発行する」を混同しないよう、動詞・見た目を明確に分ける。
  if (scan?.outcome === "unregistered") {
    return (
      <div className={`${PANEL_BASE} border border-accent-2 bg-paper-3 py-5`}>
        <p className="text-sm text-muted">未登録のカードです</p>
        <span className="font-outlier text-4xl tabular-nums text-ink">
          {formatTicketNumber(scan.previewNumber ?? 0)}
        </span>
        <span className="font-outlier text-xs text-muted">
          カード {formatCardIdShort(scan.cardId)}
        </span>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRegister}
            disabled={pending}
            className="min-h-11 whitespace-nowrap rounded-card bg-accent-2 px-4 py-2 text-sm font-semibold text-accent-ink transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            この番号で登録する
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            className="min-h-11 whitespace-nowrap rounded-card border border-rule-2 bg-transparent px-4 py-2 text-sm font-semibold text-ink-2 transition-colors duration-[264ms] ease-out hover:bg-paper-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  // 登録済み・未紐付けカードの検出: 「カードのタップ」に続く「注文品のタップ」の
  // 2アクション目。ここでボタンを押すと即座に発行される(選択→確定の別段階にはしない)。
  if (scan?.outcome === "unbound") {
    return (
      <div className={`${PANEL_BASE} border border-accent bg-paper-3 py-5`}>
        <span className="font-outlier text-5xl tabular-nums text-ink">
          {formatTicketNumber(scan.previewNumber ?? 0)}
        </span>
        <span className="font-outlier text-xs text-muted">
          カード {formatCardIdShort(scan.cardId)}
        </span>
        <p className="text-sm text-muted">注文の品を選ぶと発行されます</p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {MENU_ITEMS.map((menuItem) => (
            <button
              key={menuItem.id}
              type="button"
              onClick={() => onIssue(menuItem.id)}
              disabled={pending}
              className="min-h-11 whitespace-nowrap rounded-card bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors duration-[264ms] ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {menuItem.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            className="min-h-11 whitespace-nowrap rounded-card border border-rule-2 bg-transparent px-4 py-2 text-sm font-semibold text-ink-2 transition-colors duration-[264ms] ease-out hover:bg-paper-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  // 既存チケットに紐づいたカードの検出: 対応するカードは下のカンバンでハイライトされる。
  // ここでは「想定内の動作」であることだけを穏やかに伝え、danger扱いにはしない。
  if (scan?.outcome === "bound") {
    return (
      <div className={`${PANEL_BASE} border border-rule bg-paper-2 py-3`}>
        <p className="text-sm text-muted">
          このカードは{" "}
          <TicketNumber
            number={scan.ticketNumber ?? 0}
            className="text-ink-2"
          />{" "}
          に割り当て済みです
        </p>
      </div>
    );
  }

  if (readerStatus !== "connected") {
    const message =
      readerStatus === "disconnected"
        ? "リーダーが接続されていません"
        : "NFCリーダーは無効です";
    const tone = readerStatus === "disconnected" ? "text-danger" : "text-muted";
    return (
      <div
        className={`${PANEL_BASE} border border-dashed border-rule-2 bg-paper-2 py-4`}
      >
        <p className={`text-sm font-medium ${tone}`}>{message}</p>
      </div>
    );
  }

  // Idle: リーダー接続済み・タップ待ち。プライマリボタンではないので accent 塗りにしない。
  return (
    <div className={`${PANEL_BASE} border border-dashed border-rule-2 bg-paper-2 py-4`}>
      <Nfc size={28} className="text-ink-2" />
      <p className="text-sm font-medium text-ink-2">カードをタッチして発行</p>
      <p className="text-xs text-muted">
        登録済み{" "}
        <span className="font-outlier tabular-nums">{registeredCardCount}</span> 枚
      </p>
    </div>
  );
}
