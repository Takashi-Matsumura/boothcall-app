import {
  type ActionResult,
  type BoothSnapshot,
  type IssueResult,
  type LastScan,
  type ReaderStatus,
  type Ticket,
  type TicketAction,
  nextTicketNumber,
} from "@/lib/types";

// COMPLETED はサイネージ/画面に表示する分だけ保持すればよいので、
// 無限に溜め続けないよう直近件数で切り詰める。
const MAX_COMPLETED_HISTORY = 20;

type Listener = (snapshot: BoothSnapshot) => void;

type BoothState = {
  tickets: Ticket[];
  nextNumber: number;
  version: number;
  listeners: Set<Listener>;
  lastScan: LastScan | null;
  /** scanId の採番元。resetSession() でも巻き戻さない(下記コメント参照)。 */
  scanCounter: number;
  readerStatus: ReaderStatus;
};

// next dev の HMR でこのモジュールが再評価されても状態が飛ばないよう、
// globalThis に状態を退避する定番パターン。
const globalForStore = globalThis as unknown as {
  __boothState?: BoothState;
};

function createInitialState(): BoothState {
  return {
    tickets: [],
    nextNumber: 1,
    version: 0,
    listeners: new Set(),
    lastScan: null,
    scanCounter: 0,
    readerStatus: "unavailable",
  };
}

const state = (globalForStore.__boothState ??= createInitialState());

function snapshot(): BoothSnapshot {
  // COMPLETED を含む全件のうち、表示用に COMPLETED だけ直近件数に切り詰める。
  const active = state.tickets.filter((t) => t.status !== "COMPLETED");
  const completed = state.tickets
    .filter((t) => t.status === "COMPLETED")
    .slice(-MAX_COMPLETED_HISTORY);

  return {
    version: state.version,
    tickets: [...active, ...completed],
    nextNumber: state.nextNumber,
    serverTime: Date.now(),
    lastScan: state.lastScan,
    readerStatus: state.readerStatus,
  };
}

function broadcast() {
  const current = snapshot();
  for (const listener of state.listeners) {
    listener(current);
  }
}

export function getSnapshot(): BoothSnapshot {
  return snapshot();
}

/** cardId が現在アクティブ(非 COMPLETED)なチケットに紐づいていればそれを返す。 */
export function findActiveTicketByCard(cardId: string): Ticket | null {
  return (
    state.tickets.find((t) => t.cardId === cardId && t.status !== "COMPLETED") ??
    null
  );
}

export function issueTicket(cardId: string): IssueResult {
  const conflict = findActiveTicketByCard(cardId);
  if (conflict) {
    return { ok: false, reason: "card_in_use", ticket: conflict };
  }

  const ticket: Ticket = {
    id: crypto.randomUUID(),
    number: state.nextNumber,
    status: "PREPARING",
    createdAt: Date.now(),
    calledAt: null,
    skipped: false,
    cardId,
    meishiReceived: false,
    meishiReceivedAt: null,
  };

  state.tickets.push(ticket);
  state.nextNumber = nextTicketNumber(state.nextNumber);
  // 発行に使ったタップは消費済みなので、リロードでプロンプトが復活しないよう消す。
  state.lastScan = null;
  state.version += 1;
  broadcast();
  return { ok: true, ticket };
}

/** カードタップを記録する。既存チケットへの紐付き有無に関わらず必ず記録する。 */
export function recordScan(cardId: string): LastScan {
  const bound = findActiveTicketByCard(cardId);
  state.scanCounter += 1;
  const scan: LastScan = {
    scanId: state.scanCounter,
    cardId,
    at: Date.now(),
    outcome: bound ? "bound" : "unbound",
    ticketId: bound?.id ?? null,
    ticketNumber: bound?.number ?? null,
  };
  state.lastScan = scan;
  state.version += 1;
  broadcast();
  return scan;
}

export function clearLastScan(): void {
  if (!state.lastScan) return; // 冪等。無駄な broadcast を出さない。
  state.lastScan = null;
  state.version += 1;
  broadcast();
}

export function setReaderStatus(next: ReaderStatus): void {
  if (state.readerStatus === next) return; // 冪等。無駄な broadcast を出さない。
  state.readerStatus = next;
  state.version += 1;
  broadcast();
}

/**
 * ステータス遷移をサーバ側で検証して適用する。
 * 不正な遷移や名刺ゲート未達の場合は理由付きの失敗を返す。
 */
export function applyAction(id: string, action: TicketAction): ActionResult {
  const ticket = state.tickets.find((t) => t.id === id);
  if (!ticket) return { ok: false, reason: "not_found" };

  switch (action) {
    case "call": {
      if (ticket.status !== "PREPARING") {
        return { ok: false, reason: "invalid_transition", ticket };
      }
      ticket.status = "CALLING";
      ticket.calledAt = Date.now();
      break;
    }
    case "complete": {
      if (ticket.status !== "CALLING") {
        return { ok: false, reason: "invalid_transition", ticket };
      }
      // 名刺ゲート: サーバ側で強制する。上書き手段は提供しない。
      if (!ticket.meishiReceived) {
        return { ok: false, reason: "meishi_required", ticket };
      }
      ticket.status = "COMPLETED";
      ticket.skipped = false;
      break;
    }
    case "skip": {
      // 名刺ゲートを意図的にかけない: 呼び出したが客が戻らなかった状態であり、
      // 今後名刺を渡す機会もない。ゲートを課すと永久に抜け出せなくなる。
      if (ticket.status !== "PREPARING" && ticket.status !== "CALLING") {
        return { ok: false, reason: "invalid_transition", ticket };
      }
      ticket.status = "COMPLETED";
      ticket.skipped = true;
      break;
    }
    case "revert": {
      if (ticket.status === "CALLING") {
        ticket.status = "PREPARING";
        ticket.calledAt = null;
      } else if (ticket.status === "COMPLETED") {
        // カードが既に別チケットへ再発行済みなら、2つの非COMPLETEDチケットが
        // 同じ cardId を持つことになってしまうため復帰させない。
        const holder = findActiveTicketByCard(ticket.cardId);
        if (holder && holder.id !== ticket.id) {
          return { ok: false, reason: "card_reissued", ticket: holder };
        }
        ticket.status = "CALLING";
        ticket.calledAt = ticket.calledAt ?? Date.now();
        ticket.skipped = false;
      } else {
        return { ok: false, reason: "invalid_transition", ticket };
      }
      break;
    }
    case "meishi-on":
    case "meishi-off": {
      // COMPLETED 後の名刺フラグ変更は意味を持たないので拒否する。
      if (ticket.status === "COMPLETED") {
        return { ok: false, reason: "invalid_transition", ticket };
      }
      const next = action === "meishi-on";
      if (ticket.meishiReceived === next) {
        return { ok: true, ticket }; // 冪等。無駄な broadcast を出さない。
      }
      ticket.meishiReceived = next;
      ticket.meishiReceivedAt = next ? Date.now() : null;
      break;
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  state.version += 1;
  broadcast();
  return { ok: true, ticket };
}

export function deleteTicket(id: string): boolean {
  const index = state.tickets.findIndex((t) => t.id === id);
  if (index === -1) return false;

  state.tickets.splice(index, 1);
  state.version += 1;
  broadcast();
  return true;
}

export function resetSession(): void {
  state.tickets = [];
  state.nextNumber = 1;
  state.lastScan = null;
  // scanCounter と readerStatus は保持する: scanCounter を巻き戻すと、
  // 接続中クライアントがリセット後の新規スキャンを「既知」と誤判定して無視する。
  // readerStatus はセッションの状態ではなくハードウェアの状態なので触らない。
  state.version += 1;
  broadcast();
}

export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
