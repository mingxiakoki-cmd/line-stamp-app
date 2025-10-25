# LINE Sticker Maker (Kawaii, PWA)

React + Vite + TS で動く、LINE静止画スタンプ生成アプリです。
- 370x320 PNG でスタンプを一括生成（ZIP）
- main.png (240x240) / tab.png (96x74) も同梱
- 「画像から」/「オールおまかせ（文字）」の2モード
- PWA対応（オフラインOK。ホーム画面に追加可能）

## 開発
```bash
npm install
npm run dev
```
http://localhost:5173 で起動。

## ビルド
```bash
npm run build
npm run preview
```

## デプロイ（Vercel 推奨）
GitHub に push → Vercel で Import → Deploy のみ。HTTPSでアクセスすれば PWA としてインストール可能。
