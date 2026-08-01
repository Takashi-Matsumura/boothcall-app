/**
 * `nfc-pcsc` には型定義が同梱されておらず DefinitelyTyped にも存在しないため、
 * このプロジェクトで実際に使用する範囲のみの最小限のアンビエント宣言を用意する。
 * 実装は node_modules/nfc-pcsc/src/{NFC,Reader}.js を参照して合わせてある。
 */
declare module "nfc-pcsc" {
  import { EventEmitter } from "events";

  export type CardStandard = "TAG_ISO_14443_3" | "TAG_ISO_14443_4";

  export type Card = {
    atr: Buffer;
    standard: CardStandard;
    type: CardStandard;
    /** FeliCa/MIFARE 等、UID/IDm が取得できたカードにのみ存在する(16進文字列)。 */
    uid?: string;
    data?: Buffer;
  };

  export class Reader extends EventEmitter {
    readonly name: string;
    autoProcessing: boolean;
    close(): void;

    on(event: "card", listener: (card: Card) => void): this;
    on(event: "card.off", listener: (card: Card) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "end", listener: () => void): this;
  }

  export class NFC extends EventEmitter {
    constructor(logger?: unknown);
    readonly readers: unknown;
    close(): void;

    on(event: "reader", listener: (reader: Reader) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
}
