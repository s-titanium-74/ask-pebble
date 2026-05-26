# Pebble Time 2 ChatGPT Voice Q&A PoC 要件定義・実現可能性調査

## 1. 背景と目的

Pebble Time 2 で音声入力を行い、ChatGPT 相当の AI 回答を短文で時計に表示する自分用 PoC を開発する。まずは Pebble 上で「話す、送る、読む」までの体験を成立させ、実装前に認証方式、Pebble 側の音声入出力、スマホ経由通信の実現可能性を明確にする。

この文書の対象は要件定義と調査結果の整理までとし、watchapp、backend、Android companion の実装は含めない。

## 2. MVP 要件

### 2.1 対象環境

- 対象デバイス: Pebble Time 2
- スマホ環境: Android 優先
- 配布範囲: 自分用 PoC
- 入力言語: 日本語中心
- 回答言語: 日本語中心

### 2.2 ユーザー体験

- Pebble watchapp 上で音声入力を開始できる。
- Pebble の `Dictation` API で音声をテキスト化する。
- テキスト化された質問をスマホ経由で backend に送信する。
- AI 回答を Pebble 画面向けの短文要約として表示する。
- 会話文脈は直近数往復のみ保持する。
- Dictation 完了後、回答表示までの目標は 15 秒以内とする。

### 2.3 MVP に含めないもの

- Pebble からの生音声録音、または raw audio の直接送信
- 長文回答の全文スクロール表示
- iOS 優先対応
- 一般公開、ストア配布、知人向け beta 配布
- Android native companion app の実装
- AI 回答の TTS 音声再生

## 3. 技術構成

### 3.1 想定アーキテクチャ

MVP の実機 PoC は次の構成を第一候補とする。

```text
Pebble watchapp
  -> AppMessage
  -> PebbleKit JS on Android phone
  -> HTTPS via Tailscale Funnel
  -> local backend on PC
  -> AI/OAuth layer
```

この構成では、Pebble watchapp は音声入力と結果表示に集中し、PebbleKit JS がスマホ側の通信ブリッジになる。API key や OAuth token などの秘密情報は Pebble watchapp や PebbleKit JS に置かず、local backend 側で扱う。

### 3.2 最小 API

#### `GET /health`

backend の疎通確認用 endpoint。

想定 response:

```json
{
  "status": "ok"
}
```

#### `POST /v1/voice-query`

Pebble から送られた音声認識後テキストを AI に問い合わせ、時計表示向けの短文回答を返す endpoint。

想定 request:

```json
{
  "utterance": "今日の予定を短く整理して",
  "locale": "ja-JP",
  "conversationId": "optional-conversation-id"
}
```

想定 response:

```json
{
  "status": "ok",
  "answer": "今日は予定を3件に絞って確認しましょう。",
  "conversationId": "conversation-id"
}
```

エラー時の想定 response:

```json
{
  "status": "error",
  "answer": "通信に失敗しました。少し待って再試行してください。",
  "conversationId": "conversation-id"
}
```

#### `GET /auth/start`

ChatGPT サブスク OAuth 可否調査用の認証開始 endpoint。公式方式で成立するか、または成立しないかを検証するために使う。

#### `GET /auth/callback`

OAuth callback 調査用 endpoint。認可コード、エラー、state 検証結果などを受ける。秘密情報や token はログに出さない。

## 4. 認証方針

### 4.1 第一優先の調査項目

最初に、ChatGPT サブスクプランを外部 Pebble アプリから OAuth で直接利用できる公式手段があるかを調査する。

現時点の公式情報ベースでは、OpenAI API は API key 認証を前提としており、ChatGPT のサブスク課金と API platform の課金は別体系である。そのため、ChatGPT Plus/Pro 等のサブスク枠を外部アプリから OAuth で直接消費する方式は、少なくとも公式に一般提供されている方式としては確認できていない。

### 4.2 fallback

公式 OAuth 方式が成立しない場合は、OpenAI API backend 方式を fallback とする。

OpenAI API backend 方式では、OpenAI API key を local backend または将来の cloud backend に置き、Pebble watchapp と PebbleKit JS は自前 backend のみを呼び出す。これにより、API key を client-side code に露出しない構成にする。

### 4.3 非公式方式の扱い

非公式方式は、自分用 PoC のリスク評価対象としてのみ扱う。要件定義では次の観点を評価するが、具体的な回避手順やリバースエンジニアリング手順は文書化しない。

- OpenAI または ChatGPT の利用規約・ポリシー上のリスク
- アカウント停止や認証失効のリスク
- 仕様変更への弱さ
- token や cookie の保護難度
- 一般公開や beta 配布に耐えない可能性

一般公開、知人向け beta、長期運用を前提にする場合、非公式方式は採用しない。

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
| スマホから backend へ送る | 可能 | PebbleKit JS は HTTP request を扱える。 |
| PC backend を外部公開する | 可能 | Tailscale Funnel で local service を HTTPS 公開できる。 |
| OpenAI API を使う | 可能 | API key を backend に置けば実装できる。 |
| ChatGPT サブスクを外部アプリから OAuth 利用する | 低い / 要調査 | 公式情報では ChatGPT と API platform は別課金で、外部アプリ向けのサブスクOAuth消費方式は確認できていない。 |
| Pebble で通知音を鳴らす | 可能性あり | `Speaker` API があるため、短い tone から検証する。 |
| Pebble で AI 回答を音声再生する | v2 調査 | PCM streaming、転送量、電力、品質の実機検証が必要。 |

## 7. 未決定事項

実装に進む前に、次の 3 点を優先して検証する。

1. ChatGPT OAuth 可否
   - ChatGPT サブスクを外部 Pebble アプリから公式に OAuth 利用できるか。
   - 成立しない場合、OpenAI API backend 方式へ切り替える。

2. Speaker/TTS 可否
   - `Speaker` API で短い tone が再生できるか。
   - PCM streaming で短い音声を再生できるか。
   - AI 回答の TTS 再生が実用的か。

3. PebbleKit JS 実機通信確認
   - Dictation 結果を AppMessage で PebbleKit JS に渡せるか。
   - PebbleKit JS から Tailscale Funnel 経由の backend に HTTP request できるか。
   - backend response を Pebble watchapp に返せるか。

## 8. テスト計画

### 8.1 ドキュメント確認

- `docs/requirements.md` が存在する。
- MVP 要件、アーキテクチャ、認証リスク、speaker の扱い、テスト計画、参照 URL が含まれている。
- 未決定事項が「ChatGPT OAuth 可否」「Speaker/TTS 可否」「PebbleKit JS 実機通信確認」の 3 点に整理されている。

### 8.2 PoC 実装時の受け入れテスト

- Pebble Dictation で日本語テキストが取得できる。
- Pebble から `AppMessage` で PebbleKit JS へテキストを送れる。
- PebbleKit JS から backend へ HTTP request を送れる。
- backend から短文回答を返し、Pebble に表示できる。
- Dictation 完了後 15 秒以内に回答が表示される主要ケースがある。
- Bluetooth 切断、ネットワーク失敗、Dictation 失敗、AI 応答失敗を短いエラー表示で処理できる。
- 直近文脈ありで 2 往復の Q&A が成立する。
- `Speaker` API で短い tone を再生できる。

## 9. 参照資料

- Pebble Dictation API: https://developer.repebble.com/guides/events-and-services/dictation/
- Pebble AppMessage: https://developer.repebble.com/docs/c/Foundation/AppMessage/
- PebbleKit JS: https://developer.repebble.com/docs/pebblekit-js/
- Pebble Time 2 hardware: https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html
- Pebble Speaker API: https://developer.repebble.com/guides/events-and-services/speaker/
- OpenAI API authentication: https://platform.openai.com/docs/api-reference/authentication/api-keys
- ChatGPT/API billing separation: https://help.openai.com/en/articles/9039756-managing-billing-settings-on-chatgpt-web-and-platform
- ChatGPT subscription vs API: https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api
- GPT Actions OAuth: https://platform.openai.com/docs/actions/authentication
- Tailscale Funnel: https://tailscale.com/docs/features/tailscale-funnel
