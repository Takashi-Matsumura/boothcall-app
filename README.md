# BoothCall

展示会ブースでコーヒーを提供する際の「待ち時間」を管理するための呼出システムです。スタッフがチケット番号を発行・ステータス更新し、大型ディスプレイに呼び出し状況を表示します。

## 画面構成

| 画面 | パス | 用途 |
| --- | --- | --- |
| サイネージ表示 | `/display`(`/` からリダイレクト) | ブースの大型モニターに常時表示。呼び出し中の番号を巨大表示し、準備中の番号一覧を表示する |
| スタッフ操作 | `/admin` | 番号の発行・呼び出し・渡済み・スキップ・削除・全リセットを行う |

## 主な機能

- チケット発行 → 準備中 → 呼び出し中 → 完了(渡済み/スキップ) のステータス管理
- Server-Sent Events (SSE) による `/admin` と `/display` 間のリアルタイム同期(切断時は自動でポーリングにフォールバック)
- Web Audio API による呼び出しチャイム(ON/OFF切り替え可能)
- 削除は楽観的UI更新 + Undoトースト、全リセットは誤操作防止の2段階確認

## 技術スタック

- [Next.js 16](https://nextjs.org/)(App Router)
- React 19 / TypeScript
- Tailwind CSS v4
- [lucide-react](https://lucide.dev/)

## セットアップ

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開くと `/display` にリダイレクトされます。スタッフ操作は [http://localhost:3000/admin](http://localhost:3000/admin) から行います。

その他のコマンド:

```bash
npm run typecheck  # 型チェック
npm run lint       # ESLint
npm run build      # 本番ビルド
npm run start      # 本番サーバ起動
```

## 運用上の注意

- チケットの状態は **サーバプロセスのメモリ上にのみ保持** されます。サーバを再起動すると発行済みチケットは全て消去されます(展示会1日単位の運用を想定した割り切りです)。
- **認証機能はありません。** ブースのPC1台 + LAN上での運用を前提としており、同一ネットワーク上からは誰でも `/admin` の操作やAPIを呼び出せます。インターネット等の信頼できないネットワークに公開する構成では使用しないでください。

## License

MIT — see [LICENSE](./LICENSE).
