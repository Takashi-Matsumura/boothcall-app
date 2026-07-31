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
};

export type BoothSnapshot = {
  /** 変更のたびに +1。クライアント側の重複処理検知に使う。 */
  version: number;
  /** COMPLETED は直近 20 件のみ含む。 */
  tickets: Ticket[];
  /** 次に発行される番号。 */
  nextNumber: number;
  serverTime: number;
};

export type TicketAction = "call" | "complete" | "skip" | "revert";

const MAX_TICKET_NUMBER = 999;

export function formatTicketNumber(n: number): string {
  return String(n).padStart(3, "0");
}

export function nextTicketNumber(current: number): number {
  return current >= MAX_TICKET_NUMBER ? 1 : current + 1;
}
