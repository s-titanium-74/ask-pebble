# Pebble Time 2 BYOK AI Voice Q&A PoC 要件定義・実現可能性調査

## 1. 背景と目的

Pebble Time 2 で音声入力を行い、OpenRouter API 経由の AI 回答を短文で時計に表示する PoC を開発する。MVP では OpenRouter の provider routing で Groq only に固定し、まずは Pebble と Android phone だけで「話す、送る、読む」までの体験を成立させる。backend を持たない BYOK (Bring Your Own Key) 方式で実装可能性を確認する。

この文書の対象は要件定義と調査結果の整理までとし、watchapp、backend、Android companion の実装は含めない。ヒアリング後に確定した UI / 機能の詳細仕様は `docs/spec.md` に分離する。

## 2. MVP 要件

### 2.1 対象環境

- 対象デバイス: Pebble Time 2
- スマホ環境: Android 優先
- 配布範囲: 自分用 PoC から小規模 BYOK 配布まで
- 入力言語: 日本語中心
- 回答言語: 日本語中心
- 認証方式: BYOK 方式を第一候補とし、ユーザーが Pebble app の設定画面で自分の API key を入力する。
- MVP provider: OpenRouter API
- MVP provider route: Groq only、fallback off
- v2 以降の候補: Direct Groq API、Gemini API、OpenAI API、OpenClaw/OpenCode bridge

### 2.2 ユーザー体験

- Pebble watchapp 上で音声入力を開始できる。
- Pebble の `Dictation` API で音声をテキスト化する。
- テキスト化された質問を `AppMessage` で PebbleKit JS に渡す。
- PebbleKit JS が Android phone 上で AI provider API を直接呼び出す。
- AI 回答を Pebble 画面向けの短文要約として表示する。
- 会話文脈は直近数往復のみ保持する。
- Dictation 完了後、回答表示までの目標は通常Q&Aで 15 秒以内とする。

15 秒目標は、ユーザーが Dictation 結果を確定してから、Pebble 画面に AI 回答が表示されるまでを測定区間とする。ユーザーが発話している時間、Dictation の確認画面で迷っている時間、設定画面の操作時間は含めない。

### 2.3 MVP に含めないもの

- Pebble からの生音声録音、または raw audio の直接送信
- 長文回答の全文スクロール表示
- iOS 優先対応
- 不特定多数向け一般公開
- Android native companion app の実装
- Cloudflare Workers / PC backend の必須化
- Web 検索つき回答
- AI 回答の TTS 音声再生

## 3. 技術構成

### 3.1 想定アーキテクチャ

MVP の実機 PoC は、backend を使わず Pebble と Android phone で完結する BYOK 構成を第一候補とする。

```text
Pebble watchapp
  -> AppMessage
  -> PebbleKit JS on Android phone
  -> OpenRouter HTTPS API
  -> Groq provider only
```

この構成では、Pebble watchapp は音声入力と結果表示に集中し、PebbleKit JS がスマホ側の通信ブリッジ兼 AI provider client になる。API key は Pebble app の設定画面でユーザーが入力し、PebbleKit JS 側の保存領域に保持する。watchapp 本体には API key を渡さない。

実装前ゲートとして、Android の Pebble mobile app 内で動く PebbleKit JS から OpenRouter API へ `Authorization` header 付き HTTPS request を送信できることを最初に確認する。あわせて OpenRouter の provider routing で Groq only / fallback off の指定が成立するか確認する。この確認が通らない場合、backend なし BYOK 構成は MVP の第一候補から外し、Cloudflare Worker または local backend 経由の構成を MVP 代替案として再評価する。

### 3.2 設定画面

Pebble app の設定画面で、次の項目を入力・保存できるようにする。

- OpenRouter API key
- Language
- OpenRouter model
- max output tokens
- memory depth
- timeout seconds
- system instruction
- API key 削除ボタン
- 会話履歴リセットボタン
- OpenRouter API key 作成ページと credits / usage 確認ページへのリンク

OpenRouter model は、推奨モデルを選ぶ dropdown と、任意の model id を入力できる手入力欄を用意する。dropdown は MVP 推奨モデルを迷わず選ぶための UI とし、手入力欄は OpenRouter 側のモデル追加や model id 変更に追従するための escape hatch として扱う。

MVP の dropdown 候補は、`meta-llama/llama-3.1-8b-instruct`、`meta-llama/llama-3.3-70b-instruct`、`openai/gpt-oss-20b` とする。手入力欄に値がある場合は手入力値を優先し、空の場合は dropdown の選択値を使う。手入力値が無効、権限なし、または provider API で拒否された場合は、時計には `model_failed`、`provider_failed`、`auth_failed` 相当の短いエラーを表示し、設定画面で model id の確認を促す。

MVP の provider 情報は設定画面に read-only で表示する。表示内容は `Provider: OpenRouter`、`Route: Groq only`、`Fallbacks: Off` とし、MVP では変更不可とする。

MVP では Web 検索設定を含めない。Web 検索の enabled / disabled は v1 拡張の設定項目として扱う。

設定画面は Pebble の `configurable` capability と PebbleKit JS の configuration page で実装する。設定UIは Clay を第一候補とし、外部hostingなしで PBW に同梱できる形を優先する。

API key はユーザー自身の OpenRouter API key を使う。アプリ開発者の共通 API key を PebbleKit JS に埋め込むことは禁止する。

### 3.3 PebbleKit JS 内部インターフェース

PebbleKit JS は、watchapp から受け取った音声認識後テキストを OpenRouter client に渡す。MVP では provider adapter の汎用化を必須にせず、OpenRouter 固定で実装する。

想定 input:

```json
{
  "type": "ask",
  "requestId": 2,
  "utterance": "今日の予定を短く整理して",
  "language": "Japanese",
  "recentMessages": []
}
```

想定 output:

```json
{
  "type": "answer",
  "requestId": 2,
  "status": "ok",
  "answer": "今日は予定を3件に絞って確認しましょう。"
}
```

エラー時は provider の詳細エラーをそのまま時計に出さず、短い表示用メッセージへ丸める。

```json
{
  "type": "error",
  "requestId": 2,
  "status": "error",
  "errorCode": "network_failed",
  "message": "Connection failed"
}
```

### 3.4 AppMessage payload 制約

MVP では AppMessage の分割転送は行わず、1 request / 1 response をそれぞれ 1 message に収める。

- watchapp から PebbleKit JS へ送る `utterance` は、UTF-8 で 512 bytes 以内を初期安全上限の目安にする。この値は AppMessage の固定上限ではなく、outbox size と dictionary overhead を考慮した PoC 上限である。
- PebbleKit JS から watchapp へ返す `answer` は、UTF-8 で 768 bytes 以内、または 240 characters 以内を初期安全上限の目安にする。この値も AppMessage の固定上限ではなく、inbox size と dictionary overhead を考慮した PoC 上限である。
- provider の回答が上限を超える場合、PebbleKit JS 側で文末を省略し、時計には短縮済み回答だけを送る。
- 短縮時は末尾に `...` を付け、`...` を含めて文字数 / byte 数上限内に収める。
- AppMessage の key は、`type`、`requestId`、`status`、`answer`、`errorCode`、`message`、`hasApiKey` のように表示に必要な最小限へ絞る。
- MVP では長文回答、出典リスト、raw provider response、token usage を watchapp に送らない。
- 実装時は `app_message_inbox_size_maximum()` / `app_message_outbox_size_maximum()` または buffer size 計算を確認し、上記目安が実機で収まるか検証する。

### 3.5 会話履歴

MVP では、会話履歴は PebbleKit JS 側で直近 2 往復だけ保持する。履歴は AI provider への request context に使うためのもので、watchapp へ全文を送らない。

- `memory depth=2` を初期値とし、設定値は `0`、`1`、`2`、`3` から選べる。`0` の場合は履歴なしの単発Q&Aとして動作する。
- MVP の会話履歴は PebbleKit JS の runtime memory に保持し、localStorage などの永続 storage には保存しない。
- Pebble mobile app または PebbleKit JS runtime が再起動した場合、会話履歴は消えてよい。
- 履歴へ追加するのは、成功した user utterance と表示用に短縮済みの assistant answer のみとする。
- provider の raw response、raw error、token usage、長文回答全文は履歴に保存しない。
- API key 削除時、または設定画面の履歴リセット操作時に、会話履歴も消去する。
- MVP の AppMessage には `conversationId` を含めない。watchapp は `requestId` だけを管理し、PebbleKit JS が必要なら内部 local id として現在会話を管理する。

### 3.6 backend 拡張案

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

MVP は OpenRouter BYOK 方式を採用する。ユーザーは Pebble app の設定画面で自分の OpenRouter API key を入力し、PebbleKit JS がその key を使って OpenRouter API を呼び出す。OpenRouter の provider routing は Groq only / fallback off に固定する。

BYOK 方式は、backend 不要で Pebble + Android phone だけで完結でき、既存の Pebble AI app とも近い設計である。一方で、API key はスマホ側保存になるため、完全な秘密としては扱わない。

PebbleKit JS 側の保存領域は、実装上 localStorage 相当の client-side storage として扱う。OS の secure enclave や Android Keystore のような強い secret storage は MVP の前提にしない。

### 4.2 BYOK の安全要件

- API key は watchapp 本体へ送信しない。
- API key は source code、PBW package、GitHub repo に含めない。
- 設定画面に API key 削除ボタンを用意する。
- API key 削除時は、保存済み key と会話履歴を PebbleKit JS 側 storage から削除する。
- API key 保存済みの場合は、設定画面に `OpenRouter API key saved` と表示し、実値や末尾は表示しない。
- API key、質問文、AI回答、provider の raw error を通常ログに出さない。
- provider error を時計に表示する場合は、`auth_failed`、`model_failed`、`rate_limited`、`network_failed`、`provider_failed` のような短い内部 error code に丸める。
- ユーザーに、provider 側で専用 key を作り、必要に応じて revoke できるよう案内する。
- ユーザーに、provider 側の spend limit / rate limit / usage log を確認するよう案内する。
- 開発者共通 API key を client-side code に埋め込まない。
- 小規模配布時は、利用料金、漏洩、rate limit、revoke の責任範囲を明記する。

### 4.3 provider 方針

MVP の provider は OpenRouter API とし、OpenRouter の provider routing で Groq only に固定する。理由は、OpenRouter API key だけで model id と provider routing を扱え、将来の provider/model 切り替え余地を残しつつ、MVP では Groq の高速応答を検証できるためである。

初期実装では provider adapter の汎用化を必須にしない。まず OpenRouter 固定、routing は Groq only で、Dictation から回答表示までの体験を完成させる。

v2 以降の拡張候補として、Direct Groq API、Gemini API、OpenAI API、OpenClaw/OpenCode bridge を残す。

### 4.4 モデル選定

MVP のデフォルトモデルは、短文Q&Aでの速度、無料枠、低コストを優先して選ぶ。

| provider | 用途 | default model | 理由 |
| --- | --- | --- | --- |
| OpenRouter -> Groq only | 第一候補 | `meta-llama/llama-3.1-8b-instruct` | 軽量・高速寄り。時計向け短文回答の初期検証に向く。 |
| OpenRouter -> Groq only | 品質優先の代替 | `meta-llama/llama-3.3-70b-instruct` | 軽量モデルで回答品質が足りない場合の候補。 |
| OpenRouter -> Groq only | reasoning寄り代替 | `openai/gpt-oss-20b` | 高速で、少し推論寄りの回答を試したい場合の候補。 |
| Direct Groq or OpenRouter拡張 | v1 web search利用 | `groq/compound-mini` 等 | Web search を使う候補。通常Q&Aより応答時間とコストを別途検証する。 |

MVP の初期値は `provider=openrouter`、`route=groq_only`、`fallbacks=off`、`model=meta-llama/llama-3.1-8b-instruct`、`language=Japanese`、`max output tokens=300`、`memory depth=2`、`timeout seconds=12` とする。Pebble画面で読みやすいよう、system instruction では小さなスマートウォッチ画面向けに簡潔で実用的な回答を返すよう指定する。

system instruction には、回答を 240 characters 以内に収める指示も含める。ただし LLM の出力長制御は保証ではないため、PebbleKit JS 側でも AppMessage 送信前に文字数 / UTF-8 byte 数を確認し、上限を超える回答は短縮する。

### 4.5 Web 検索方針

Web 検索は MVP に含めず、v1 拡張機能として扱う。MVP では `web search=disabled` 固定とし、通常の短文Q&A体験を先に成立させる。

v1 では、時計上または設定画面で「検索ON/OFF」を設定できるようにし、検索が必要な質問だけで使う。

v1 では、OpenRouter 経由で検索対応モデル/機能を使うか、Direct Groq API の `groq/compound` または `groq/compound-mini` を使うかを再評価する。第一候補は応答速度と軽さを重視して決める。検索結果の全文をPebbleへ返さず、回答は短文要約と必要最小限の出典名またはドメインに圧縮する。

Web 検索ON時は通常の短文Q&Aより遅くなる可能性があるため、15秒以内目標は「通常Q&A」に適用し、検索ON時は30秒以内を暫定目標とする。

### 4.6 ChatGPT OAuth / 非公式方式の扱い

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
- MVP では AppMessage の分割転送を行わず、上限を超えた input / output は短縮する。
- 送信中、成功、失敗、timeout、Bluetooth 未接続を UI 状態として扱う。
- `AppMessage` の inbox/outbox buffer は最大値を確認し、必要最小限で確保する。

### 5.3 Pebble Time 2 の speaker

Pebble Time 2 にはハードウェアとして speaker がある。RePebble SDK 4.9+ の `Speaker` API では、tone、note sequence、polyphonic tracks、PCM streaming が扱える。

ただし MVP では、回答の主出力は画面表示とし、speaker や tone feedback は使わない。speaker の通知音、短い確認音、AI 回答の TTS 再生は v2 の調査項目とする。

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
| OpenRouter API を使う | 要検証 / MVP本線 | ユーザーの OpenRouter API key を設定画面で受け取り、PebbleKit JS から呼ぶ。 |
| OpenRouter で Groq only routing を使う | 要検証 / MVP本線 | OpenRouter の provider routing で Groq only / fallback off を指定する。 |
| Direct Groq API を使う | v2以降 / 代替案 | MVPでは本線にしない。OpenRouter経由との速度・費用・安定性比較候補。 |
| Gemini / OpenAI API を使う | v2以降 | MVPでは対応しない。OpenRouter/Groq onlyで体験が成立した後に追加検討する。 |
| Web 検索つき回答 | 可能 / v1拡張 | OpenRouter経由またはDirect Groq Compoundを再評価する。通常Q&Aより遅延・費用・quotaを別途検証する。 |
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
- OpenRouter API key を使いつつ、Groq only routing で高速応答を検証する。
- BYOK 方式を明確にし、backendなしで完結させる。
- 将来、Direct Groq API、speaker/TTS、Gemini/OpenAI provider、OpenClaw/OpenCode bridge を追加検証できる設計にする。

## 8. 実装前検証事項

MVP 実装に進む前に、次の 2 点を優先して検証する。

1. BYOK 設定保存と provider 呼び出し
   - Pebble app 設定画面で OpenRouter API key を入力・保存できるか。
   - PebbleKit JS から OpenRouter API を直接呼べるか。
   - OpenRouter の `Authorization` header、`X-OpenRouter-Title` header、response parsing が PebbleKit JS 上で問題ないか。
   - OpenRouter の provider routing で Groq only / fallback off を指定できるか。
   - 直呼びが失敗する場合、Cloudflare Worker または local backend 経由で同じ request / response が成立するか。

2. PebbleKit JS 実機通信確認
   - Dictation 結果を AppMessage で PebbleKit JS に渡せるか。
   - PebbleKit JS から AI provider API に HTTP request できるか。
   - provider response を Pebble watchapp に返せるか。

v1 拡張に進む前に、Web 検索ON時の provider 呼び出しが PebbleKit JS から成立するか検証する。

v2 調査に進む前に、次を確認する。

- `Speaker` API で短い tone が再生できるか。
- PCM streaming で短い音声を再生できるか。
- AI 回答の TTS 再生が実用的か。

## 9. テスト計画

### 9.1 ドキュメント確認

- `docs/requirements.md` が存在する。
- MVP 要件、BYOK アーキテクチャ、認証リスク、speaker の扱い、テスト計画、参照 URL が含まれている。
- `docs/spec.md` に、ヒアリングで確定した UI / 機能仕様が分離されている。
- 実装前検証事項が MVP 前、v1 前、v2 前の検証事項に整理されている。

### 9.2 PoC 実装時の受け入れテスト

- Pebble Dictation で日本語テキストが取得できる。
- Pebble から `AppMessage` で PebbleKit JS へテキストを送れる。
- Android の PebbleKit JS から OpenRouter API へ `Authorization` header 付き HTTPS request を送れる。
- OpenRouter request に `X-OpenRouter-Title: Pebble GPT` を付けられる。
- OpenRouter の provider routing で Groq only / fallback off を指定できる。
- Pebble app の設定画面で OpenRouter API key と OpenRouter model を保存できる。
- PebbleKit JS が OpenRouter API response を parse し、表示用の短文回答へ変換できる。
- provider から短文回答を返し、Pebble に表示できる。
- Dictation 完了後 15 秒以内に回答が表示される主要ケースがある。
- Bluetooth 切断、ネットワーク失敗、Dictation 失敗、API key 未設定、provider 応答失敗を短いエラー表示で処理できる。
- 直近文脈ありで 2 往復の Q&A が成立する。
- 上限を超える質問または回答が、AppMessage 送信前に短縮される。
- 通常Q&Aを 20 回試行し、成功ケースの p50 が 10 秒以内、p90 が 12 秒以内である。timeout ケースは成功ケースから除外し、timeout rate として別途確認する。
- OpenRouter API 呼び出しまたは PebbleKit JS 処理が 12 秒を超えた場合、timeout として時計に短いエラーを表示できる。

### 9.3 v1 拡張時の受け入れテスト

- Web 検索OFFの通常Q&Aと、Web 検索ONの最新情報Q&Aを切り替えられる。
- Web 検索ON時は 30 秒以内に短文回答と必要最小限の出典名またはドメインが表示される主要ケースがある。

### 9.4 v2 調査時の受け入れテスト

- `Speaker` API で短い tone を再生できる。
- PCM streaming で短い音声を再生できるか確認できる。

## 10. 参照資料

- Pebble Dictation API: https://developer.repebble.com/guides/events-and-services/dictation/
- Pebble AppMessage: https://developer.repebble.com/docs/c/Foundation/AppMessage/
- PebbleKit JS: https://developer.repebble.com/docs/pebblekit-js/
- Pebble App Configuration: https://developer.repebble.com/guides/user-interfaces/app-configuration-static/
- Clay configuration framework: https://github.com/pebble/clay
- Pebble Time 2 hardware: https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html
- Pebble Speaker API: https://developer.repebble.com/guides/events-and-services/speaker/
- OpenRouter API Reference: https://openrouter.ai/docs/api-reference/overview
- OpenRouter Provider Routing: https://openrouter.ai/docs/features/provider-routing
- OpenRouter Models: https://openrouter.ai/models
- OpenRouter Providers: https://openrouter.ai/providers
- OpenRouter API Keys: https://openrouter.ai/settings/keys
- OpenRouter Credits: https://openrouter.ai/settings/credits
- OpenAI API authentication: https://platform.openai.com/docs/api-reference/authentication/api-keys
- ChatGPT/API billing separation: https://help.openai.com/en/articles/9039756-managing-billing-settings-on-chatgpt-web-and-platform
- ChatGPT subscription vs API: https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api
- GPT Actions OAuth: https://platform.openai.com/docs/actions/authentication
- Groq API Reference: https://console.groq.com/docs/api-reference
- Groq Built-in Tools: https://console.groq.com/docs/compound/built-in-tools
- Gemini API Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini Grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search
- OpenAI Web Search: https://platform.openai.com/docs/guides/tools-web-search
- Cloudflare Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- hb MabelAI: https://apps.repebble.com/hb-mabelai_699d02835f9b050009af836b
- Bobby: https://bobby.rebble.io/
