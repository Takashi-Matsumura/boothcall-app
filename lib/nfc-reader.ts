import type { NFC as NfcType, Reader } from "nfc-pcsc";
import { recordScan, setReaderStatus } from "@/lib/store";
import { isValidCardId, normalizeCardId } from "@/lib/types";

// 同一カードの連投を抑止する冷却時間。card.off を受信すれば即座に解除する。
// 実機での連続タップ・置きっぱなし挙動を見て展示会当日までにチューニングすること。
const SCAN_COOLDOWN_MS = 1500;

type NfcRuntime = {
  started: boolean;
  nfc: NfcType | null;
  /** cardId -> 最後に採用した時刻。 */
  cooldown: Map<string, number>;
  /** 接続中リーダー名。複数刺さっても正しく status を出せるよう Set で持つ。 */
  readers: Set<string>;
};

// next dev の HMR で instrumentation.ts の register() が再発火しても二重に
// NFC インスタンス・リスナが作られないよう、globalThis に状態を退避する
// (lib/store.ts の __boothState と同じパターン)。
//
// 注意: このファイルを編集すると next dev のモジュール再評価により
// register() が再度呼ばれるが、下記ガードにより実質的な再初期化は起きない。
// つまりこのファイルの変更を反映するには dev サーバの再起動が必要になる。
const globalForNfc = globalThis as unknown as { __boothNfc?: NfcRuntime };

export async function startNfcReader(): Promise<void> {
  if (globalForNfc.__boothNfc?.started) return;

  // await より前に started を立てる。ここを後にすると、register() が
  // 2回発火した場合に両方がガードを通り抜けて二重初期化されてしまう。
  const runtime: NfcRuntime = {
    started: true,
    nfc: null,
    cooldown: new Map(),
    readers: new Set(),
  };
  globalForNfc.__boothNfc = runtime;

  try {
    const { NFC } = await import("nfc-pcsc");
    const nfc = new NFC();
    runtime.nfc = nfc;
    setReaderStatus("disconnected"); // PC/SC は上がった。リーダー待ち。

    nfc.on("reader", (reader: Reader) => {
      runtime.readers.add(reader.name);
      setReaderStatus("connected");

      reader.on("card", (card) => {
        if (process.env.BOOTHCALL_NFC_DEBUG === "1") {
          console.info("[nfc] card", card.type, card.uid);
        }
        if (!card.uid) return; // ISO 14443-4/AID 経路などで uid が無いケース。
        const cardId = normalizeCardId(card.uid);
        if (!isValidCardId(cardId)) return;

        const now = Date.now();
        if (now - (runtime.cooldown.get(cardId) ?? 0) < SCAN_COOLDOWN_MS) return;
        runtime.cooldown.set(cardId, now);
        recordScan(cardId);
      });

      // カードを離したら冷却を解除する。「離して再タッチ」は常に即応答させたい。
      reader.on("card.off", (card) => {
        if (card.uid) runtime.cooldown.delete(normalizeCardId(card.uid));
      });

      // 読み取り途中でカードを抜いた等は日常茶飯事。readerStatus は変更しない。
      reader.on("error", (err) => {
        console.warn("[nfc] reader error", reader.name, err);
      });

      reader.on("end", () => {
        runtime.readers.delete(reader.name);
        setReaderStatus(runtime.readers.size > 0 ? "connected" : "disconnected");
      });
    });

    // pcsclite レベルの失敗(PC/SC サービス停止など)。
    nfc.on("error", (err) => {
      console.warn("[nfc] pcsc error", err);
      setReaderStatus("unavailable");
    });
  } catch (error) {
    console.warn("[nfc] disabled — nfc-pcsc unavailable", error);
    setReaderStatus("unavailable");
    // started は true のままにする。false に戻すと dev の再評価のたびに
    // ネイティブモジュールの読み込みを再試行してしまう。
  }
}

/** 本番では未使用。開発時の明示的なホットリロード用の逃げ道として用意する。 */
export function stopNfcReader(): void {
  const runtime = globalForNfc.__boothNfc;
  if (!runtime?.nfc) return;
  runtime.nfc.close();
  globalForNfc.__boothNfc = undefined;
  setReaderStatus("unavailable");
}
