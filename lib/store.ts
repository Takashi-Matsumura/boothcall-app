import {
  type BoothSnapshot,
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

export function issueTicket(): Ticket {
  const ticket: Ticket = {
    id: crypto.randomUUID(),
    number: state.nextNumber,
    status: "PREPARING",
    createdAt: Date.now(),
    calledAt: null,
    skipped: false,
  };

  state.tickets.push(ticket);
  state.nextNumber = nextTicketNumber(state.nextNumber);
  state.version += 1;
  broadcast();
  return ticket;
}

/**
 * ステータス遷移をサーバ側で検証して適用する。
 * 不正な遷移(現在のステータスから許可されていないアクション)の場合は null を返す。
 */
export function applyAction(id: string, action: TicketAction): Ticket | null {
  const ticket = state.tickets.find((t) => t.id === id);
  if (!ticket) return null;

  switch (action) {
    case "call": {
      if (ticket.status !== "PREPARING") return null;
      ticket.status = "CALLING";
      ticket.calledAt = Date.now();
      break;
    }
    case "complete": {
      if (ticket.status !== "CALLING") return null;
      ticket.status = "COMPLETED";
      ticket.skipped = false;
      break;
    }
    case "skip": {
      if (ticket.status !== "PREPARING" && ticket.status !== "CALLING") {
        return null;
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
        ticket.status = "CALLING";
        ticket.calledAt = ticket.calledAt ?? Date.now();
        ticket.skipped = false;
      } else {
        return null;
      }
      break;
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  state.version += 1;
  broadcast();
  return ticket;
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
  state.version += 1;
  broadcast();
}

export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
