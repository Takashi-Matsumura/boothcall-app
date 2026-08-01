import { getCardNumber, getRegistryStats } from "@/lib/card-registry";
import { MENU_ITEMS, type MenuItemId } from "@/lib/menu";
import {
  type ActionResult,
  type BoothSnapshot,
  type IssueResult,
  type LastScan,
  type OrderTallyEntry,
  type ReaderStatus,
  type Ticket,
  type TicketActionRequest,
} from "@/lib/types";

// COMPLETED はサイネージ/画面に表示する分だけ保持すればよいので、
// 無限に溜め続けないよう直近件数で切り詰める。
const MAX_COMPLETED_HISTORY = 20;

type Listener = (snapshot: BoothSnapshot) => void;

type BoothState = {
  tickets: Ticket[];
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
    version: 0,
    listeners: new Set(),
    lastScan: null,
    scanCounter: 0,
    readerStatus: "unavailable",
  };
}

const state = (globalForStore.__boothState ??= createInitialState());

/**
 * メニュー項目ごとの注文・渡済み杯数。20件に切り詰められる COMPLETED 表示とは別に、
 * 削除されていない全チケットを対象に毎回サーバ側で算出する(件数自体は少ないので
 * 都度の集計コストは無視できる)。
 */
function computeOrderTally(): OrderTallyEntry[] {
  return MENU_ITEMS.map(({ id }) => {
    const ordered = state.tickets.filter((t) => t.item === id).length;
    const served = state.tickets.filter(
      (t) => t.item === id && t.status === "COMPLETED" && !t.skipped,
    ).length;
    return { item: id, ordered, served };
  });
}

function snapshot(): BoothSnapshot {
  // COMPLETED を含む全件のうち、表示用に COMPLETED だけ直近件数に切り詰める。
  const active = state.tickets.filter((t) => t.status !== "COMPLETED");
  const completed = state.tickets
    .filter((t) => t.status === "COMPLETED")
    .slice(-MAX_COMPLETED_HISTORY);
  const { registeredCardCount, nextRegistryNumber } = getRegistryStats();

  return {
    version: state.version,
    tickets: [...active, ...completed],
    serverTime: Date.now(),
    lastScan: state.lastScan,
    readerStatus: state.readerStatus,
    registeredCardCount,
    nextRegistryNumber,
    orderTally: computeOrderTally(),
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

export function issueTicket(cardId: string, item: MenuItemId): IssueResult {
  const conflict = findActiveTicketByCard(cardId);
  if (conflict) {
    return { ok: false, reason: "card_in_use", ticket: conflict };
  }

  // 番号はカードに恒久的に割り当てられたもの(映画館の半券方式)。
  // 未登録のカードでは発行できない — 先に登録が必要。
  const number = getCardNumber(cardId);
  if (number === null) {
    return { ok: false, reason: "card_not_registered" };
  }

  const ticket: Ticket = {
    id: crypto.randomUUID(),
    number,
    status: "PREPARING",
    createdAt: Date.now(),
    calledAt: null,
    skipped: false,
    cardId,
    meishiReceived: false,
    meishiReceivedAt: null,
    item,
  };

  state.tickets.push(ticket);
  // 発行に使ったタップは消費済みなので、リロードでプロンプトが復活しないよう消す。
  state.lastScan = null;
  state.version += 1;
  broadcast();
  return { ok: true, ticket };
}

/** カードタップを記録する。登録状態・既存チケットへの紐付き有無に関わらず必ず記録する。 */
export function recordScan(cardId: string): LastScan {
  const registeredNumber = getCardNumber(cardId);
  const bound =
    registeredNumber !== null ? findActiveTicketByCard(cardId) : null;
  state.scanCounter += 1;

  const scan: LastScan = {
    scanId: state.scanCounter,
    cardId,
    at: Date.now(),
    outcome:
      registeredNumber === null ? "unregistered" : bound ? "bound" : "unbound",
    ticketId: bound?.id ?? null,
    ticketNumber: bound?.number ?? null,
    previewNumber: bound
      ? null
      : registeredNumber === null
        ? getRegistryStats().nextRegistryNumber
        : registeredNumber,
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
 * ステータス遷移・注文品の変更をサーバ側で検証して適用する。
 * 不正な遷移や名刺ゲート未達の場合は理由付きの失敗を返す。
 */
export function applyAction(
  id: string,
  request: TicketActionRequest,
): ActionResult {
  const ticket = state.tickets.find((t) => t.id === id);
  if (!ticket) return { ok: false, reason: "not_found" };

  switch (request.action) {
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
      const next = request.action === "meishi-on";
      if (ticket.meishiReceived === next) {
        return { ok: true, ticket }; // 冪等。無駄な broadcast を出さない。
      }
      ticket.meishiReceived = next;
      ticket.meishiReceivedAt = next ? Date.now() : null;
      break;
    }
    case "set-item": {
      // 渡し終えた注文の中身を後から書き換えると集計が実態とずれるため拒否する。
      if (ticket.status === "COMPLETED") {
        return { ok: false, reason: "invalid_transition", ticket };
      }
      if (ticket.item === request.item) {
        return { ok: true, ticket }; // 冪等。無駄な broadcast を出さない。
      }
      ticket.item = request.item;
      break;
    }
    default: {
      const exhaustiveCheck: never = request;
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
  state.lastScan = null;
  // scanCounter と readerStatus、そしてカード登録レジストリ(lib/card-registry.ts)は
  // 保持する: scanCounter を巻き戻すと、接続中クライアントがリセット後の新規スキャンを
  // 「既知」と誤判定して無視する。readerStatus はハードウェアの状態なので触らない。
  // カード登録は物理的にシールを貼った恒久的な対応表であり、セッション(その日の
  // 待ち行列)のリセットとは無関係。
  state.version += 1;
  broadcast();
}

export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
