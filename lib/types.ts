export type TicketStatus = "PREPARING" | "CALLING" | "COMPLETED";

export type Ticket = {
  id: string;
  /** 1..999 の連番。999 の次は 1 に巻き戻る。 */
  number: number;
  status: TicketStatus;
  createdAt: number;
  calledAt: number | null;
  /** COMPLETED のうち「呼び出したが渡せなかった（スキップ）」を区別するフラグ */
  skipped: boolean;
  /** 紐づく FeliCa カードの IDm(正規化済み・小文字16進)。カード無しのチケットは存在しない。 */
  cardId: string;
  /** 担当者の名刺を受け取ったか。false の間は complete(渡済み) を禁止する。 */
  meishiReceived: boolean;
  /** 名刺受領フラグを ON にした時刻。運用ログ用途、UI 表示では未使用。 */
  meishiReceivedAt: number | null;
};

export type ScanOutcome = "unbound" | "bound";

export type LastScan = {
  /** 単調増加の採番。同じカードの連続タップでも必ず変わる。クライアントの新旧判定用。 */
  scanId: number;
  cardId: string;
  at: number;
  outcome: ScanOutcome;
  /** outcome === "bound" のときのみ非 null。 */
  ticketId: string | null;
  ticketNumber: number | null;
};

/**
 * unavailable: nfc-pcsc 未起動・読み込み失敗(開発機など) — muted 表示。
 * disconnected: PC/SC は動いているがリーダー未接続 — danger 表示(要対応)。
 * connected: リーダー接続中 — accent 表示。
 */
export type ReaderStatus = "unavailable" | "disconnected" | "connected";

export type BoothSnapshot = {
  /** 変更のたびに +1。クライアント側の重複処理検知に使う。 */
  version: number;
  /** COMPLETED は直近 20 件のみ含む。 */
  tickets: Ticket[];
  /** 次に発行される番号。 */
  nextNumber: number;
  serverTime: number;
  /** 直近のカードタップ。未タップ・破棄済みは null。 */
  lastScan: LastScan | null;
  readerStatus: ReaderStatus;
};

export type TicketAction =
  | "call"
  | "complete"
  | "skip"
  | "revert"
  | "meishi-on"
  | "meishi-off";

export type ActionFailureReason =
  | "not_found"
  | "invalid_transition"
  | "meishi_required"
  | "card_reissued";

export type ActionResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: ActionFailureReason; ticket?: Ticket };

export type IssueResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: "card_in_use"; ticket: Ticket };

const MAX_TICKET_NUMBER = 999;

export function formatTicketNumber(n: number): string {
  return String(n).padStart(3, "0");
}

export function nextTicketNumber(current: number): number {
  return current >= MAX_TICKET_NUMBER ? 1 : current + 1;
}

// FeliCa の IDm は 16 桁の16進文字列だが、実機到着前の検証で 8 桁(MIFARE 等)の
// カードを使うことも見込み、8〜32 桁を許容する。
const CARD_ID_PATTERN = /^[0-9a-f]{8,32}$/;

/** リーダー・API から来た生の IDm を正規化する(小文字化・区切り記号の除去)。 */
export function normalizeCardId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
}

export function isValidCardId(cardId: string): boolean {
  return CARD_ID_PATTERN.test(cardId);
}

/** UI 表示用に末尾4桁だけを大文字で返す(スタッフによる目視確認用)。 */
export function formatCardIdShort(cardId: string): string {
  return cardId.slice(-4).toUpperCase();
}
