import fs from "node:fs";
import path from "node:path";
import type { CardRegistration, RegisterCardResult } from "@/lib/types";

// このアプリで唯一ディスクに永続化するデータ。カードのIDmと恒久番号の対応は
// 一度シールを貼ってしまうと物理的に貼り直せないため、他の状態(チケット・
// セッション・スキャン等)とは異なり、サーバ再起動をまたいで保持する必要がある。
const REGISTRY_PATH = path.join(process.cwd(), "data", "card-registry.json");

type RegistryFile = {
  version: 1;
  /** 次に新規登録されるカードに割り当てられる番号。 */
  nextNumber: number;
  cards: Record<string, { number: number; registeredAt: number }>;
};

type RegistryRuntime = {
  loaded: boolean;
  data: RegistryFile;
};

// next dev の HMR でこのモジュールが再評価されても二重読み込みしないよう、
// lib/store.ts と同じ globalThis 退避パターンを使う。
const globalForRegistry = globalThis as unknown as {
  __boothCardRegistry?: RegistryRuntime;
};

function createEmpty(): RegistryFile {
  return { version: 1, nextNumber: 1, cards: {} };
}

function loadRegistry(): RegistryRuntime {
  if (globalForRegistry.__boothCardRegistry?.loaded) {
    return globalForRegistry.__boothCardRegistry;
  }

  let data: RegistryFile;
  if (!fs.existsSync(REGISTRY_PATH)) {
    data = createEmpty();
  } else {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as RegistryFile).cards !== "object" ||
        typeof (parsed as RegistryFile).nextNumber !== "number"
      ) {
        throw new Error("unexpected shape");
      }
      data = parsed as RegistryFile;
    } catch (error) {
      // 壊れたファイルを黙って空にすると、既にシールを貼った物理カードの番号を
      // 失う恐れがある。安全側に倒し、原因が分かる形で例外を投げて処理を止める。
      throw new Error(
        `card-registry.json の読み込みに失敗しました(${REGISTRY_PATH})。` +
          `ファイルが壊れている可能性があります。手動で復旧するまでカード登録・` +
          `発行機能は利用できません。原因: ${(error as Error).message}`,
      );
    }
  }

  const runtime: RegistryRuntime = { loaded: true, data };
  globalForRegistry.__boothCardRegistry = runtime;
  return runtime;
}

function persist(data: RegistryFile): void {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  const tmpPath = `${REGISTRY_PATH}.tmp`;
  // 一時ファイルに書いてから rename する(同一ファイルシステム内で原子的)ことで、
  // 書き込み途中でプロセスが落ちてもファイルが壊れないようにする。
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, REGISTRY_PATH);
}

/** 登録済みならそのカードの恒久番号を返す。未登録なら null。 */
export function getCardNumber(cardId: string): number | null {
  const { data } = loadRegistry();
  return data.cards[cardId]?.number ?? null;
}

/**
 * カードを登録する。既に登録済みなら何もせず既存の番号を返す(冪等)。
 * 未登録なら次の番号を恒久的に割り当てて即座に永続化する。
 */
export function registerCard(cardId: string): RegisterCardResult {
  const runtime = loadRegistry();
  const existing = runtime.data.cards[cardId];
  if (existing) {
    return { cardId, number: existing.number, alreadyRegistered: true };
  }

  const number = runtime.data.nextNumber;
  runtime.data.cards[cardId] = { number, registeredAt: Date.now() };
  runtime.data.nextNumber = number + 1;
  persist(runtime.data);
  return { cardId, number, alreadyRegistered: false };
}

export function listRegisteredCards(): CardRegistration[] {
  const { data } = loadRegistry();
  return Object.entries(data.cards)
    .map(([cardId, entry]) => ({
      cardId,
      number: entry.number,
      registeredAt: entry.registeredAt,
    }))
    .sort((a, b) => a.number - b.number);
}

/**
 * 登録を取り消す(誤タップ・誤登録の取り消し用)。まだシールを貼っていない
 * 直近の登録(= 採番カウンタの最新値)を取り消す場合に限り、欠番を作らないよう
 * カウンタを戻す。それ以外は番号を空けたまま残す(reassignCardNumber で
 * 明示的に引き継がせる想定)。
 */
export function removeCardRegistration(cardId: string): boolean {
  const runtime = loadRegistry();
  const entry = runtime.data.cards[cardId];
  if (!entry) return false;

  delete runtime.data.cards[cardId];
  if (entry.number === runtime.data.nextNumber - 1) {
    runtime.data.nextNumber = entry.number;
  }
  persist(runtime.data);
  return true;
}

/**
 * カード破損・紛失時に、同じ恒久番号を新しい物理カードへ引き継がせる。
 * (現時点ではUIを持たず、必要になった場合にAPI経由で使う運用を想定。)
 */
export function reassignCardNumber(
  oldCardId: string,
  newCardId: string,
):
  | { ok: true; number: number }
  | { ok: false; reason: "not_found" | "new_card_already_registered" } {
  const runtime = loadRegistry();
  const oldEntry = runtime.data.cards[oldCardId];
  if (!oldEntry) return { ok: false, reason: "not_found" };
  if (runtime.data.cards[newCardId]) {
    return { ok: false, reason: "new_card_already_registered" };
  }

  const number = oldEntry.number;
  delete runtime.data.cards[oldCardId];
  runtime.data.cards[newCardId] = { number, registeredAt: Date.now() };
  persist(runtime.data);
  return { ok: true, number };
}

export function getRegistryStats(): {
  registeredCardCount: number;
  nextRegistryNumber: number;
} {
  const { data } = loadRegistry();
  return {
    registeredCardCount: Object.keys(data.cards).length,
    nextRegistryNumber: data.nextNumber,
  };
}
