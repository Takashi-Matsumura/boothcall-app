/**
 * サーバ起動時に1回だけ呼ばれる。ここで FeliCa カードリーダー(PC/SC)の監視を開始する。
 * 詳細は lib/nfc-reader.ts のコメントを参照。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // edge では native アドオンを扱えない
  if (process.env.NEXT_PHASE === "phase-production-build") return; // ビルド中は開かない
  if (process.env.BOOTHCALL_NFC === "0") return; // 開発機で明示的に無効化したいとき

  try {
    const { startNfcReader } = await import("@/lib/nfc-reader");
    await startNfcReader();
  } catch (error) {
    // モジュール解決・ネイティブバインディングの読み込み失敗をここで捕まえる。
    // NFC が使えなくてもチケット業務そのものは動き続けなければならないため、
    // サーバ起動を失敗させない。
    console.warn("[nfc] reader module could not be loaded; continuing", error);
  }
}
