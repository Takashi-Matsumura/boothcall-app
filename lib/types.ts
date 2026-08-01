import type { MenuItemId } from "@/lib/menu";

export type TicketStatus = "PREPARING" | "CALLING" | "COMPLETED";

export type Ticket = {
  id: string;
  /** カードに恒久的に割り当てられた番号(lib/card-registry.ts 参照)。 */
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
  /** 注文されたコーヒーの種類(lib/menu.ts)。チケットは必ず1種類を持つ。 */
  item: MenuItemId;
};

export type ScanOutcome = "unregistered" | "unbound" | "bound";

export type LastScan = {
  /** 単調増加の採番。同じカードの連続タップでも必ず変わる。クライアントの新旧判定用。 */
  scanId: number;
  cardId: string;
  at: number;
  outcome: ScanOutcome;
  /** outcome === "bound" のときのみ非 null。 */
  ticketId: string | null;
  ticketNumber: number | null;
  /**
   * outcome === "unregistered" のときは登録した場合に割り当てられる予定の番号、
   * outcome === "unbound" のときはそのカードに既に恒久登録されている番号
   * (= 発行時にそのまま使われる番号)。outcome === "bound" のときは null
   * (既存チケットの番号は ticketNumber が持つ)。
   */
  previewNumber: number | null;
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
  serverTime: number;
  /** 直近のカードタップ。未タップ・破棄済みは null。 */
  lastScan: LastScan | null;
  readerStatus: ReaderStatus;
  /** カード登録の進捗表示用。 */
  registeredCardCount: number;
  /** 次に新規登録されるカードに割り当てられる番号のプレビュー。 */
  nextRegistryNumber: number;
  /** メニュー項目ごとの注文・渡済み杯数集計(削除済みチケットは含まない)。 */
  orderTally: OrderTallyEntry[];
};

/** メニュー項目ごとの集計(lib/store.ts の snapshot() が算出)。 */
export type OrderTallyEntry = {
  item: MenuItemId;
  /** 削除されていない全チケット数(発行ベース)。 */
  ordered: number;
  /** COMPLETED かつスキップされていない(実際に渡した)数。 */
  served: number;
};

export type TicketActionRequest =
  | {
      action: "call" | "complete" | "skip" | "revert" | "meishi-on" | "meishi-off";
    }
  | { action: "set-item"; item: MenuItemId };

export type TicketAction = TicketActionRequest["action"];

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
  | { ok: false; reason: "card_in_use"; ticket: Ticket }
  | { ok: false; reason: "card_not_registered" };

/** カードごとの恒久番号登録(lib/card-registry.ts)。 */
export type CardRegistration = {
  cardId: string;
  number: number;
  registeredAt: number;
};

export type RegisterCardResult = {
  cardId: string;
  number: number;
  /** 既に登録済みだった(冪等に既存の番号を返した)場合 true。 */
  alreadyRegistered: boolean;
};

export function formatTicketNumber(n: number): string {
  return String(n).padStart(3, "0");
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
