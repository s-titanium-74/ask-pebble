# Pebble Time 2 BYOK AI Voice Q&A PoC 要件定義・実現可能性調査

## 1. 背景と目的

Pebble Time 2 で音声入力を行い、Gemini / Groq / OpenAI などの AI 回答を短文で時計に表示する PoC を開発する。まずは Pebble と Android phone だけで「話す、送る、読む」までの体験を成立させ、backend を持たない BYOK (Bring Your Own Key) 方式で実装可能性を確認する。

この文書の対象は要件定義と調査結果の整理までとし、watchapp、backend、Android companion の実装は含めない。

## 2. MVP 要件

### 2.1 対象環境

- 対象デバイス: Pebble Time 2
- スマホ環境: Android 優先
- 配布範囲: 自分用 PoC から小規模 BYOK 配布まで
- 入力言語: 日本語中心
- 回答言語: 日本語中心
- 認証方式: BYOK 方式を第一候補とし、ユーザーが Pebble app の設定画面で自分の API key を入力する。
- 第一 provider 候補: Gemini API
- 差し替え provider 候補: Groq API、OpenAI API、OpenClaw/OpenCode bridge

### 2.2 ユーザー体験

- Pebble watchapp 上で音声入力を開始できる。
- Pebble の `Dictation` API で音声をテキスト化する。
- テキスト化された質問を `AppMessage` で PebbleKit JS に渡す。
- PebbleKit JS が Android phone 上で AI provider API を直接呼び出す。
- AI 回答を Pebble 画面向けの短文要約として表示する。
- 会話文脈は直近数往復のみ保持する。
- Dictation 完了後、回答表示までの目標は 15 秒以内とする。

### 2.3 MVP に含めないもの

- Pebble からの生音声録音、または raw audio の直接送信
- 長文回答の全文スクロール表示
- iOS 優先対応
- 不特定多数向け一般公開
- Android native companion app の実装
- Cloudflare Workers / PC backend の必須化
- AI 回答の TTS 音声再生

## 3. 技術構成

### 3.1 想定アーキテクチャ

MVP の実機 PoC は、backend を使わず Pebble と Android phone で完結する BYOK 構成を第一候補とする。

```text
Pebble watchapp
  -> AppMessage
  -> PebbleKit JS on Android phone
  -> AI provider HTTPS API
     - Gemini API
     - Groq API
     - OpenAI API
```

この構成では、Pebble watchapp は音声入力と結果表示に集中し、PebbleKit JS がスマホ側の通信ブリッジ兼 AI provider client になる。API key は Pebble app の設定画面でユーザーが入力し、PebbleKit JS 側の保存領域に保持する。watchapp 本体には API key を渡さない。

### 3.2 設定画面

Pebble app の設定画面で、次の項目を入力・保存できるようにする。

- provider: `gemini` / `groq` / `openai`
- API key
- model
- max output tokens
- memory depth
- system instruction または回答スタイル
- API key 削除ボタン

設定画面は Pebble の `configurable` capability と PebbleKit JS の configuration page で実装する。設定UIは Clay を第一候補とし、外部hostingなしで PBW に同梱できる形を優先する。

API key はユーザー自身のものを使う。アプリ開発者の共通 API key を PebbleKit JS に埋め込むことは禁止する。

### 3.3 PebbleKit JS 内部インターフェース

PebbleKit JS は、watchapp から受け取った音声認識後テキストを provider 別の adapter に渡す。

想定 input:

```json
{
  "utterance": "今日の予定を短く整理して",
  "locale": "ja-JP",
  "conversationId": "optional-conversation-id",
  "recentMessages": []
}
```

想定 output:

```json
{
  "status": "ok",
  "answer": "今日は予定を3件に絞って確認しましょう。",
  "conversationId": "conversation-id"
}
```

エラー時は provider の詳細エラーをそのまま時計に出さず、短い表示用メッセージへ丸める。

```json
{
  "status": "error",
  "answer": "通信に失敗しました。少し待って再試行してください。",
  "conversationId": "conversation-id"
}
```

### 3.4 backend 拡張案

BYOK 方式で体験検証ができた後、必要に応じて Cloudflare Workers または local backend を追加する。

```text
Pebble watchapp
  -> AppMessage
  -> PebbleKit JS on Android phone
  -> Cloudflare Worker or local backend
  -> AI provider API
```

backend 方式は、API key を Workers Secrets や server-side env に置きたい場合、rate limit や利用量監視を入れたい場合、複数ユーザーへ安全に配布したい場合に検討する。完全に自分向けなら Workers Secrets に自分の API key を置く方式も可能だが、他ユーザーの利用分も自分の quota / 課金になる。

## 4. 認証方針

### 4.1 MVP の認証方式: BYOK

MVP は BYOK 方式を採用する。ユーザーは Pebble app の設定画面で自分の Gemini / Groq / OpenAI API key を入力し、PebbleKit JS がその key を使って provider API を呼び出す。

BYOK 方式は、backend 不要で Pebble + Android phone だけで完結でき、既存の Pebble AI app とも近い設計である。一方で、API key はスマホ側保存になるため、完全な秘密としては扱わない。

### 4.2 BYOK の安全要件

- API key は watchapp 本体へ送信しない。
- API key は source code、PBW package、GitHub repo に含めない。
- 設定画面に API key 削除ボタンを用意する。
- API key の表示は mask する。
- ユーザーに、provider 側で専用 key を作り、必要に応じて revoke できるよう案内する。
- 開発者共通 API key を client-side code に埋め込まない。
- 小規模配布時は、利用料金、漏洩、rate limit、revoke の責任範囲を明記する。

### 4.3 provider 方針

第一 provider は Gemini API とする。理由は、無料枠があり、PoC の初期検証に向くためである。

provider adapter は差し替え可能な形にし、次を候補にする。

- Gemini API: 第一候補。無料枠、日本語、将来の TTS 検証を期待する。
- Groq API: 高速応答候補。日本語TTSは別途検証する。
- OpenAI API: 安定した公式API候補。API課金前提。
- OpenClaw/OpenCode bridge: ChatGPT/Codex サブスク活用候補。自分用PoC向けの別ルートとして扱う。

### 4.4 ChatGPT OAuth / 非公式方式の扱い

ChatGPT サブスクプランを外部 Pebble アプリから OAuth で直接利用する方式は、MVP の本命から外す。

OpenClaw/OpenCode bridge のような ChatGPT/Codex サブスク活用ルートは、自分用 PoC の追加検証候補として扱う。ただし、一般公開や小規模配布の前提にはしない。非公式方式の具体的な回避手順やリバースエンジニアリング手順は文書化しない。

## 5. Pebble 機能の実現可能性

### 5.1 音声入力

Pebble の `Dictation` API は、マイク対応ハードウェアで任意のテキスト入力を取得するための API である。音声は Pebble phone application 経由で認識サービスに送られ、watchapp には文字起こし結果が返る。

MVP では raw audio ではなく、この文字起こし結果を AI に送る。これにより、Pebble 側で音声データの圧縮、分割転送、音声認識処理を行う必要を避ける。

実装時の注意点:

- `PBL_MICROPHONE` の compile-time define と API の戻り値でマイク非対応環境を扱う。
- Dictation 結果は callback 終了後に無効になるため、必要な文字列はアプリ側 buffer にコピーする。
- Dictation buffer サイズを超えた文字列は切り詰められるため、質問は短文前提にする。
- Bluetooth または Internet 接続がない場合のエラー表示を用意する。

### 5.2 スマホ経由通信

`AppMessage` は Pebble watchapp と phone app 側の双方向 key/value 通信に使える。PebbleKit JS は Pebble mobile app 内で動き、watchapp からの `AppMessage` を受け取り、HTTP request を実行し、結果を watchapp に返せる。

実装時の注意点:

- `AppMessage` には message size 制限がある。
- 回答は短文要約を基本とし、長文は送らない。
- 送信中、成功、失敗、timeout、Bluetooth 未接続を UI 状態として扱う。
- `AppMessage` の inbox/outbox buffer は最大値を確認し、必要最小限で確保する。

### 5.3 Pebble Time 2 の speaker

Pebble Time 2 にはハードウェアとして speaker がある。RePebble SDK 4.9+ の `Speaker` API では、tone、note sequence、polyphonic tracks、PCM streaming が扱える。

ただし MVP では、回答の主出力は画面表示とする。speaker は通知音や短い確認音の実機検証に留める。AI 回答を TTS 化して Pebble で再生する機能は v2 の調査項目とする。

TTS/PCM 再生を v2 に回す理由:

- PCM streaming は転送量と buffering の制約を受けやすい。
- 長い音声再生は電力消費が大きい。
- PebbleKit JS から watchapp への音声 chunk 転送設計が別途必要になる。
- 時計スピーカーで自然な音声回答を聞ける品質か実機評価が必要になる。

## 6. 実現可能性まとめ

| 項目 | 判定 | 理由 |
| --- | --- | --- |
| Pebble で音声入力する | 可能 | `Dictation` API が利用できる。MVP は text input として扱う。 |
| Pebble からスマホへ送る | 可能 | `AppMessage` で watchapp と phone side の双方向通信ができる。 |
| スマホから AI provider API へ送る | 可能 | PebbleKit JS は HTTP request を扱える。 |
| BYOK 設定画面を作る | 可能 | Pebble app configuration / Clay で設定画面を作れる。 |
| Gemini API を使う | 可能 | ユーザーの API key を設定画面で受け取り、PebbleKit JS から呼ぶ。 |
| Groq / OpenAI API を使う | 可能 | provider adapter を分ければ差し替えられる。 |
| Cloudflare Workers backend を使う | 可能 / 拡張案 | API key を Secrets に置けるが、開発者keyの quota / 課金になる。 |
| ChatGPT サブスクを外部アプリから OAuth 利用する | MVP外 | 一般公開向けの公式 OAuth API としては採用しない。OpenClaw/OpenCode bridge は自分用追加検証候補。 |
| Pebble で通知音を鳴らす | 可能性あり | `Speaker` API があるため、短い tone から検証する。 |
| Pebble で AI 回答を音声再生する | v2 調査 | PCM streaming、転送量、電力、品質の実機検証が必要。 |

## 7. 既存アプリ・競合認識

Pebble / RePebble ecosystem には、すでに近いカテゴリのアプリがある。

- hb MabelAI: Pebble Dictation で音声入力し、Claude / Gemini / ChatGPT を API key 設定で使う AI assistant。Time 2 対応表記あり。
- Bobby: Rebble の LLM voice assistant。Gemini technology を使い、質問回答、timer、reminder、天気などを提供する。

そのため、本 PoC の新規性は「音声AIアシスタントそのもの」ではなく、次に置く。

- Pebble Time 2 / Android の現在環境で自分が改造しやすい最小構成を作る。
- 日本語短文回答に最適化する。
- Gemini 無料枠を第一候補にする。
- BYOK 方式を明確にし、backendなしで完結させる。
- 将来、speaker/TTS や OpenClaw/OpenCode bridge を追加検証できる設計にする。

## 8. 未決定事項

実装に進む前に、次の 3 点を優先して検証する。

1. BYOK 設定保存と provider 呼び出し
   - Pebble app 設定画面で API key を入力・保存できるか。
   - PebbleKit JS から Gemini API を直接呼べるか。
   - provider API の CORS / HTTP header / response parsing が PebbleKit JS 上で問題ないか。

2. Speaker/TTS 可否
   - `Speaker` API で短い tone が再生できるか。
   - PCM streaming で短い音声を再生できるか。
   - AI 回答の TTS 再生が実用的か。

3. PebbleKit JS 実機通信確認
   - Dictation 結果を AppMessage で PebbleKit JS に渡せるか。
   - PebbleKit JS から AI provider API に HTTP request できるか。
   - provider response を Pebble watchapp に返せるか。

## 9. テスト計画

### 9.1 ドキュメント確認

- `docs/requirements.md` が存在する。
- MVP 要件、BYOK アーキテクチャ、認証リスク、speaker の扱い、テスト計画、参照 URL が含まれている。
- 未決定事項が「BYOK 設定保存と provider 呼び出し」「Speaker/TTS 可否」「PebbleKit JS 実機通信確認」の 3 点に整理されている。

### 9.2 PoC 実装時の受け入れテスト

- Pebble Dictation で日本語テキストが取得できる。
- Pebble から `AppMessage` で PebbleKit JS へテキストを送れる。
- Pebble app の設定画面で provider と API key を保存できる。
- PebbleKit JS から Gemini API へ HTTP request を送れる。
- provider から短文回答を返し、Pebble に表示できる。
- Dictation 完了後 15 秒以内に回答が表示される主要ケースがある。
- Bluetooth 切断、ネットワーク失敗、Dictation 失敗、API key 未設定、provider 応答失敗を短いエラー表示で処理できる。
- 直近文脈ありで 2 往復の Q&A が成立する。
- `Speaker` API で短い tone を再生できる。

## 10. 参照資料

- Pebble Dictation API: https://developer.repebble.com/guides/events-and-services/dictation/
- Pebble AppMessage: https://developer.repebble.com/docs/c/Foundation/AppMessage/
- PebbleKit JS: https://developer.repebble.com/docs/pebblekit-js/
- Pebble App Configuration: https://developer.repebble.com/guides/user-interfaces/app-configuration-static/
- Clay configuration framework: https://github.com/pebble/clay
- Pebble Time 2 hardware: https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html
- Pebble Speaker API: https://developer.repebble.com/guides/events-and-services/speaker/
- OpenAI API authentication: https://platform.openai.com/docs/api-reference/authentication/api-keys
- ChatGPT/API billing separation: https://help.openai.com/en/articles/9039756-managing-billing-settings-on-chatgpt-web-and-platform
- ChatGPT subscription vs API: https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api
- GPT Actions OAuth: https://platform.openai.com/docs/actions/authentication
- Groq API Reference: https://console.groq.com/docs/api-reference
- Gemini API Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Cloudflare Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- hb MabelAI: https://apps.repebble.com/hb-mabelai_699d02835f9b050009af836b
- Bobby: https://bobby.rebble.io/
