# Obsidian to esa.io

現在編集中の Obsidian ノートを esa.io に投稿するプラグインです。

## 機能

- アクティブなノートを esa.io に投稿 / 下書き投稿
- フロントマターから title, tags, category をパース
- `![[image.png]]` などの添付ファイルの自動アップロード（画像/音声/動画/PDF）
- `[[title]]` リンクの esa.io 記事リンクへの自動解決
- esa.io 上に同じタイトルの記事がある場合は上書き更新
- 投稿前にカテゴリを確認・変更可能
- レート制限チェック（残リクエスト数が不足している場合は警告）

## インストール

### 推奨: BRAT を使う

1. [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) をインストール
2. `Obsidian42 - BRAT` → `Add Beta plugin` → `https://github.com/misumisumi/obsidian-to-esa` を入力
3. 設定 → `Obsidian to esa.io` でチーム名、API トークン、デフォルトカテゴリを設定

### 手動インストール

[Releases](https://github.com/misumisumi/obsidian-to-esa/releases) から `main.js`、`manifest.json`、`styles.css` をダウンロードし、`<vault>/.obsidian/plugins/obsidian-to-esa/` に配置してください。

## 使い方

1. 設定画面で esa.io の **チーム名** と **API トークン** を設定
   - トークンは esa.io のユーザー設定 → トークンから発行（read + write 権限）
2. 投稿したいノートを開く
3. コマンドパレットから以下のコマンドを実行:
   - **Post current note to esa.io** — 公開記事として投稿
   - **Post current note to esa.io as draft** — 下書きとして投稿

### カテゴリ指定

- フロントマターに `category:` を書いておくと初期値として使用されます
   ```
   ---
   title: サンプル記事
   category: Obsidian / Imported
   ---
   ```
- 投稿前にモーダルでカテゴリを変更できます

## ライセンス

MIT
