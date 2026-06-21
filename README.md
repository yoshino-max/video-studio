# Video Studio MVP

社内チーム共有用のAI動画生成ツール。起点フレーム+終点フレーム+プロンプトで動画を生成します。

- **動画生成**: fal.ai 経由の Kling（image-to-video, 起点+終点フレーム対応）
- **プロンプト最適化**: OpenAI GPT-4o（日本語→英語映像演出プロンプト変換）
- **認証**: Basic認証（社内共有パスワード1つ）
- **デプロイ先**: Vercel（無料枠でOK）

---

## デプロイ手順（所要時間 約20分）

### 事前準備（5分）

以下の3つのアカウントが必要です。すでにある場合はスキップ。

1. **GitHub** — https://github.com で無料登録
2. **Vercel** — https://vercel.com で「Continue with GitHub」を選択
3. **fal.ai** — https://fal.ai で登録（動画生成用）
4. **OpenAI** — https://platform.openai.com で登録

それぞれで必要なクレジット入金:

- fal.ai: 新規無料クレジットあり。本格利用は$5〜（5秒動画 約30〜50円）
- OpenAI: 最低$5〜（プロンプト最適化は1回約$0.01）

### STEP 1. APIキーの取得（5分）

#### fal.ai のキー（動画生成用）

1. https://fal.ai にアクセスし、右上「Sign up」からGoogleアカウント等で登録
2. https://fal.ai/dashboard/keys を開く
3. 「Create Key」をクリックし、名前（例: `video-studio`）を付ける
4. `fal_sk_...` で始まるキーが**一度だけ**表示されるので、必ずコピーして保存
5. 新規アカウントには無料クレジットが付くので、すぐお試しできます

#### OpenAI のキー

1. https://platform.openai.com/api-keys にログイン
2. 「Create new secret key」をクリック
3. 名前を入力（例: `video-studio-prompts`）して作成
4. `sk-proj-...` で始まるキーが表示されるので、メモ帳に保存

### STEP 2. GitHubにコードをアップロード（5分）

#### 方法A. GitHub Web UI（最も簡単・推奨）

1. https://github.com/new で新規リポジトリ作成
   - 名前: `video-studio`（任意）
   - Private（社内用なので必ずPrivateに）
   - 「Create repository」をクリック
2. 表示されたページで「uploading an existing file」リンクをクリック
3. 配布されたZIPを展開したフォルダの **中身全部** をドラッグ&ドロップ
   - `package.json`, `src/`, `README.md` 等が全て見える状態にする
4. 一番下の「Commit changes」をクリック

#### 方法B. ターミナル（Git経験者向け）

```bash
cd video-tool-mvp
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/video-studio.git
git push -u origin main
```

### STEP 3. Vercelにデプロイ（5分）

1. https://vercel.com/new にアクセス
2. 「Import Git Repository」セクションで、上で作成したリポジトリを選択
3. 「Configure Project」画面が出る
4. **「Environment Variables」を展開して、以下を入力**：

| Name | Value |
|---|---|
| `FAL_KEY` | STEP 1で取得した fal.ai のキー（`fal_sk_...`） |
| `OPENAI_API_KEY` | STEP 1で取得したOpenAI Key |
| `OPENAI_MODEL` | `gpt-4o` |
| `APP_PASSWORD` | 社内共有用の好きなパスワード（例: `team-2026-secret`） |
| `TEAM_MONTHLY_LIMIT` | チーム全体の月次生成上限（例: `500`）。未設定なら無制限 |
| `MASTER_KEY` | 64文字のhex（下記コマンドで生成） |

`MASTER_KEY`の生成方法（ターミナルで実行）:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Node.jsを持っていない場合は、https://www.random.org/strings で「64 hex characters」を生成してもOK。

5. 「Deploy」をクリック
6. **約2分でビルド完了**、URL（例: `https://video-studio-xxxx.vercel.app`）が発行される

### STEP 4. 動作確認

1. Vercel が発行したURLにアクセス
2. ブラウザがユーザー名・パスワードを聞いてくる
   - ユーザー名: 何でもOK（例: `team`）
   - パスワード: 環境変数で設定した `APP_PASSWORD` の値
3. ログイン後、メイン画面が表示される
4. 起点・終点画像をアップロードし、プロンプトを入力
5. 「ChatGPTで最適化」を押して英語プロンプトが出ればOpenAI連携成功
6. 「動画を生成」を押して、60〜120秒待って動画が生成されればfal.ai連携成功

### STEP 5. 社内チームへの共有

URLとパスワードを社内チャットで共有するだけです。

```
社内向け動画生成ツールができました
URL: https://video-studio-xxxx.vercel.app
パスワード: team-2026-secret
（ユーザー名は何でもOK）
```

---

## 予算ガードレール（コスト管理機能）

「使いすぎ防止のブレーキ」として、チーム全体の月次生成上限を設定できます。

### 設定方法

Vercelの環境変数 `TEAM_MONTHLY_LIMIT` に本数を設定するだけです（例: `500`）。

### 動作

- メイン画面の上部に「今月のチーム生成: X / Y本」の予算バーが表示される
- 残りが少なくなると黄色→赤に変化
- 上限に達すると生成ボタンが自動的に無効化され、それ以上生成できない
- `/dashboard` でコストダッシュボードを確認できる（メンバー別利用状況・生成履歴・推定コスト）

### 上限を変更したいとき

Vercelダッシュボード → Settings → Environment Variables → `TEAM_MONTHLY_LIMIT` の値を変更 → 再デプロイ。

### 重要な制約（簡易版の仕様）

このMVPはDBを使わない簡易版のため、生成カウントはVercelの一時領域（/tmp）に保存されます。以下の制約があります。

- **デプロイのたびにカウントがリセットされます**（再デプロイ = 今月の使用数が0に戻る）
- アクセスが長時間ないとカウントが揮発する可能性があります
- 「厳密な会計」ではなく「使いすぎ防止のブレーキ」として機能します

完全な永続化（再デプロイしても消えない、複数サーバー間で正確に共有）が必要になったら、Vercel KV（無料枠あり）への差し替えが可能です。`src/lib/budget.ts` のファイル読み書き部分をKVのget/setに置き換えるだけで対応できる構造にしてあります。必要になったらご相談ください。



Vercelダッシュボード → プロジェクト → Settings → Domains で、自社ドメイン（例: `video.yourcompany.com`）を設定できます。CNAMEレコードを追加するだけ。

## ローカルで動かす（開発者向け）

```bash
npm install
cp .env.example .env.local
# .env.local に各APIキーを記入
npm run dev
# http://localhost:3000 で開く
```

## トラブルシューティング

### 「生成失敗」とすぐ出る（401や認証エラー）

→ FAL_KEY が間違っているか、fal.aiのクレジット切れ。Vercelの環境変数を確認し、fal.aiダッシュボードで残高をチェック。

### 「プロンプト最適化に失敗」と出る

→ OpenAI APIキーが間違っているか、OpenAIのクレジット切れ。

### 「動画URLを開いたら404」と出る

→ fal.aiの動画URLは一定期間で消える場合があります。気に入った動画は生成完了直後にダウンロードして保存してください。
→ 後付けで永続保存したい場合は、Vercel Blob または Cloudflare R2 への自動アップロード機能を追加できます（拡張時に相談を）。

### Vercelのビルドが「Function Runtimes must have a valid version」で失敗

→ `next.config.mjs` の内容を確認。プロジェクト直下にあるか確認。

### Vercelの実行時間制限（Hobby: 10秒）に引っかかる

→ Hobbyプラン（無料）では最大10秒。`/api/generate` だけならOKだが、ポーリングはクライアント側で実行しているので問題なし。
→ ただし `/api/optimize` でOpenAI応答が10秒超える場合があるため、Vercel Proプラン（$20/月）にアップグレードすると最大60秒まで延長可能。

## コスト試算

| 利用シーン | 月間生成数 | 想定コスト/月 |
|---|---|---|
| 個人軽利用 | 30本 | 約$15（≈¥2,300） |
| チーム検証 | 200本 | 約$80（≈¥12,000） |
| 量産運用 | 1000本 | 約$400（≈¥60,000） |
| Vercel Pro | - | $20/月 |

OpenAIプロンプト最適化のコストは1回約$0.01と微々たるもの。

## 拡張アイデア

- バッチ生成（同一プロンプトでN本並列生成）
- 動画の永続保存（Vercel Blob / Cloudflare R2連携）
- ユーザー個別のAPIキー管理（BYOK完全対応）
- Slack/Discord通知（生成完了時）
- A/Bテスト結果の記録（広告運用CVR連携）

ご要望があれば追加開発のサポートが可能です。

---

## 技術スタック

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS（最小限のみ、ほぼinline style）
- fal.ai 経由の Kling（普通のAPIキー認証）
- OpenAI（gpt-4o）
- Vercel Hosting

## ライセンス

社内利用前提。再配布前にはレビュー推奨。
