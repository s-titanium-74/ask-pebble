# Ask Pebbpe MVP UI / Functional Specification

This document captures the decided MVP UI and functional behavior for the Ask Pebbpe PoC.

The original feasibility and requirements notes remain in `docs/requirements.md`. This file is the implementation-facing specification produced from follow-up product decisions.

## 1. Product Shape

- The MVP is a lightweight voice Q&A app for Pebble Time 2.
- The primary loop is: open app, speak, wait, read a short answer, ask again.
- The app uses Pebble Dictation for speech-to-text.
- The app uses PebbleKit JS on Android to call OpenRouter.
- The MVP uses BYOK: the user provides their own OpenRouter API key.
- The API key is stored only on the PebbleKit JS side and is never sent to the watchapp.

## 2. Provider

### 2.1 MVP Provider

- MVP provider: OpenRouter.
- OpenRouter provider route: model-specific.
- Speed model route: Groq only, fallback off.
- Balance, Quality, and custom models use OpenRouter default routing.
- Direct Groq API is not the MVP path. It remains a future comparison or alternative path.

Conceptual OpenRouter request behavior:

```json
{
  "model": "openai/gpt-oss-20b",
  "messages": [],
  "provider": {
    "only": ["groq"],
    "allow_fallbacks": false
  }
}
```

Implementation must verify the exact current OpenRouter provider routing field names before coding.

### 2.2 Headers

OpenRouter requests include:

- `Authorization: Bearer <OpenRouter API key>`
- `Content-Type: application/json`
- `X-OpenRouter-Title: Ask Pebbpe`

`HTTP-Referer` and `X-Title` are not required for MVP unless a stable app/site URL exists later.

### 2.3 Models

Default model:

- `openai/gpt-oss-20b`

Recommended model dropdown:

- Speed (Groq GPT-OSS 20B): `openai/gpt-oss-20b`
- Balance (GPT-5 Mini): `openai/gpt-5-mini`
- Quality (Claude Haiku 4.5): `anthropic/claude-haiku-4.5`

Before implementation, each dropdown model must be verified against OpenRouter REST API. Speed must be verified with `provider.only: ["groq"]` and `provider.allow_fallbacks: false`; the other dropdown models must be verified with OpenRouter default routing. Any model that does not work must be removed from the dropdown. The default model must also be one of the verified working models.

Custom model id:

- If empty, use the dropdown value.
- If non-empty, custom model id takes priority.
- When custom model id is active, show `Using custom model` in the configuration UI.

## 3. Watch UI

### 3.1 Startup

On launch:

1. Show `Loading` / `one moment`.
2. Watch sends a key state request to PebbleKit JS.
3. PebbleKit JS returns whether an OpenRouter API key is saved.

If key is saved:

- Main: `Ask Pebble`
- Sub: `Select to ask >`

If key is missing:

- Main: `API key`
- Sub: `Open settings`

If key state check fails:

- Show `Connection failed`.
- Select retries the key state request.
- While retrying, show `Loading` / `one moment`.

After returning from the configuration UI, or when the watchapp regains focus, automatically request key state again. If the retry succeeds and a key is saved, transition to Idle / Ready. If the key is still missing, return to the missing-key screen.

### 3.2 Idle / Ready

When API key is available:

- Main text: `Ask Pebble`
- Sub text: `Select to ask >`
- Select starts Pebble Dictation.

Idle visual treatment:

- Background: blue leaning slightly teal.
- Title: `Ask Pebble` in a white rounded title card.
- Title card includes a small accent strip.
- Prompt text: `Select to ask >`, centered, bold, and not inside a card.
- Right-side button rail shows the Pebble button positions and highlights the middle Select button.

The app does not show the previous answer on launch.

### 3.3 Missing API Key Help

When API key is missing:

- Main: `API key`
- Sub: `Open settings`
- Select shows a help screen.

Help screen:

- Main: `Pebble app`
- Sub: `Settings > API key`
- Back returns to the missing-key screen.
- When returning from settings or app focus, the watch automatically rechecks key state.

### 3.4 Dictation

- Dictation is started with Select from the ready screen.
- Dictation recognition, confirmation, retry, and errors are handled by Pebble standard Dictation UI.
- The app does not add a custom pre-send confirmation screen.
- If Dictation succeeds, send the recognized text to PebbleKit JS.
- If the user cancels or Dictation does not produce a result, return to Idle / Ready.
- If the microphone or Dictation service is unavailable, show `Voice unavailable`.

### 3.5 Sending / Thinking

After Dictation is accepted:

- Show `Thinking` / `making it tiny`.
- Back cancels the current request, sends a `cancel` request to PebbleKit JS, and returns to Idle / Ready.
- PebbleKit JS records the matching `requestId` as canceled.
- If the HTTP request can be aborted on the JS side, abort it.
- If it cannot be aborted, the later response is discarded.
- Canceled requests do not update conversation memory.

Default timeout:

- 12 seconds.

Timeout display:

- `Timed out`

### 3.6 Answer

- Show only the answer body.
- No `AI` title.
- No status/header bar in MVP.
- Background: pale cyan.
- Text: black.
- Up / Down scrolls the answer if needed.
- Select starts the next Dictation.
- Back returns to Idle / Ready.
- Returning to Idle does not reset conversation memory.

On successful answer display:

- Trigger a short vibration.

No vibration for:

- Errors.
- Stale responses.
- Canceled responses.

Speaker / tone:

- Not used in MVP.
- Speaker, tone, TTS, and PCM streaming remain v2 investigation items.

## 4. Error UI

Watch error messages are short English messages.

Raw provider errors are never shown on the watch.

Error mapping:

| errorCode | Watch message |
| --- | --- |
| `missing_api_key` | `Set API key` |
| `auth_failed` | `Check API key` |
| `model_failed` | `Check model` |
| `rate_limited` | `Limit reached` |
| `network_failed` | `Connection failed` |
| `timeout` | `Timed out` |
| `provider_failed` | `AI failed` |
| `mic_unavailable` | `Voice unavailable` |

Retryable errors:

- `Connection failed`
- `Timed out`
- `AI failed`

For retryable errors:

- Select resends the previously sent shortened utterance with a new `requestId`.
- Back returns to Idle / Ready.

Non-retryable errors:

- `Set API key`
- `Check API key`
- `Check model`
- `Limit reached`
- `Voice unavailable`

For non-retryable errors:

- Select does not resend.
- Back returns to Idle / Ready.

`Limit reached` covers:

- OpenRouter insufficient credits.
- Payment required.
- Quota exceeded.
- Spend limit reached.
- Rate limit.

## 5. Configuration UI

Configuration UI language:

- English.

### 5.1 Basic Settings

- `OpenRouter API key`
- `Language`
- Recommended model dropdown
- Provider information display
- API key delete button
- Links for OpenRouter key/credits

Provider information display:

- `Provider: OpenRouter`
- `Routing: Model-specific`
- `Speed route: Groq only`

These are read-only in MVP.

OpenRouter links:

- `Create OpenRouter API key`: `https://openrouter.ai/settings/keys`
- `Check credits / usage`: `https://openrouter.ai/settings/credits`

### 5.2 Advanced Settings

- Custom model id
- System instruction
- Max output tokens
- Memory depth
- Timeout seconds

### 5.3 API Key Behavior

API key storage:

- Store OpenRouter API key in PebbleKit JS localStorage-equivalent storage.
- Do not send the API key to the watchapp.
- Do not store the API key in source code or PBW as a shared built-in key.
- This is not strong secret storage like Android Keystore.

Saved key display:

- If no key is saved, show the API key input.
- If a key is saved, show `OpenRouter API key saved`.
- Keep the input visually empty.
- A newly entered value overwrites the saved key on save.
- Never show the full key or suffix on screen.

Delete API key:

- Button label: `Delete OpenRouter API key`.
- Requires confirmation.
- On confirmed delete:
  - Delete saved API key.
  - Delete conversation memory.
  - Clear saved-key state.

### 5.4 Reset Conversation Memory

- Configuration UI includes a `Reset conversation memory` button.
- No confirmation.
- On press:
  - Clear PebbleKit JS runtime conversation memory.
  - Do not delete API key.
  - Show `Memory reset`.

### 5.5 Language

Options:

- `Auto`
- `Japanese`
- `English`
- `Chinese (Simplified)`
- `Chinese (Traditional)`
- `Korean`
- `Spanish`
- `French`
- `German`
- `Portuguese`
- `Italian`
- `Russian`
- `Arabic`
- `Hindi`

Default:

- `Auto`

Language setting controls AI answer language and system instruction composition. It does not directly control Pebble Dictation recognition language.

Configuration note:

- `Language controls AI answers, not Pebble voice recognition.`

Auto behavior:

- Detect the user's language from the message and answer in the same language.

### 5.6 System Instruction

System instruction is composed from:

1. Base Pebble instruction.
2. Language instruction.
3. Optional custom system instruction.
4. Optional pseudo tool instruction, only on the first LLM call for a user turn.

Base instruction:

```text
Answer for a small smartwatch screen. Keep it under 240 characters. Be direct, practical, and easy to scan. The user message is speech-to-text dictation, so infer the intended meaning despite recognition errors, missing punctuation, or unstable wording. If asked your name, answer Pebble. Skip greetings, filler, and markdown unless the user asks for formatting. If uncertain, say so briefly.
```

Language instruction:

- Auto: `Detect the user's language from the message and answer in the same language.`
- Japanese: `Answer in Japanese.`
- English: `Answer in English.`
- Chinese (Simplified): `Answer in Simplified Chinese.`
- Chinese (Traditional): `Answer in Traditional Chinese.`
- Korean: `Answer in Korean.`
- Spanish: `Answer in Spanish.`
- French: `Answer in French.`
- German: `Answer in German.`
- Portuguese: `Answer in Portuguese.`
- Italian: `Answer in Italian.`
- Russian: `Answer in Russian.`
- Arabic: `Answer in Arabic.`
- Hindi: `Answer in Hindi.`

Custom system instruction:

- Empty value is allowed.
- If empty, use only base instruction plus language instruction.
- If non-empty, append it after the base and language instructions.

Pseudo tool instruction:

- Only included in the first LLM request for a user turn.
- Enabled tools are based on settings: `time`, `location`, `health`.
- If context is needed, the model must return JSON only, for example `{"tools":["location","health"],"reason":"brief"}`.
- The first request is a combined answer-or-tool request, not a separate standalone router request.
- If the first response contains JSON that cannot be parsed as a valid tool request, PebbleKit JS treats tool use as failed and makes one second LLM request without extra context.
- The second LLM request never includes tool instructions. Tool requests in the second response are ignored and displayed as normal answer text.
- A user turn is limited to at most two LLM requests.

Decision record:

- Standalone router mode was tested and rejected because `openai/gpt-5-mini` misclassified health-context requests as requiring no tools.
- Combined answer-or-tool mode passed verification for Speed, Balance, and Quality candidates after GPT-5 reasoning suppression was added.

Device context:

- Time context is enabled by default and is included as short device context.
- Location and health context are disabled by default and are fetched only if enabled and requested by the first LLM response.
- Health context is fetched by the watchapp C code through `HealthService`, then returned to PebbleKit JS through AppMessage.
- Initial health fields: `stepsToday`, `activeMinutesToday`, `sleepTodayMinutes`, `restfulSleepTodayMinutes`.

### 5.7 Advanced Value Ranges

Max output tokens:

- Options: `128`, `300`, `512`
- Default: `300`

Memory depth:

- Options: `0`, `1`, `2`, `3`
- Default: `2`
- `0` means no conversation memory.

Timeout seconds:

- Min: `8`
- Max: `20`
- Default: `12`

## 6. AppMessage Protocol

### 6.1 Request Type

AppMessage requests include `type`.

Request types:

- `key_state`
- `ask`
- `cancel`
- `health_context`

Examples:

```json
{
  "type": "key_state",
  "requestId": 1
}
```

```json
{
  "type": "ask",
  "requestId": 2,
  "utterance": "今日の予定を短く整理して"
}
```

```json
{
  "type": "cancel",
  "requestId": 2
}
```

```json
{
  "type": "health_context",
  "requestId": 2
}
```

### 6.2 Response Type

AppMessage responses include `type`.

Response types:

- `key_state`
- `answer`
- `error`
- `health_context`

Examples:

```json
{
  "type": "key_state",
  "requestId": 1,
  "status": "ok",
  "hasApiKey": true
}
```

```json
{
  "type": "answer",
  "requestId": 2,
  "status": "ok",
  "answer": "今日は3件だけ確認しましょう。"
}
```

```json
{
  "type": "error",
  "requestId": 2,
  "status": "error",
  "errorCode": "network_failed",
  "message": "Connection failed"
}
```

### 6.3 requestId

- `requestId` is generated by the watchapp.
- It is an unsigned integer sequence.
- It may restart from `1` when the app restarts.
- The watch tracks the current request id.
- Responses with a non-current request id are stale and ignored.

Stale response behavior:

- Do not update the watch UI.
- Do not vibrate.
- Do not add conversation memory.

Canceled request behavior:

- PebbleKit JS marks the `requestId` as canceled.
- PebbleKit JS aborts the HTTP request if possible.
- If abort is not possible, PebbleKit JS discards the later provider response.
- Do not send a canceled response to the watch.
- Do not add conversation memory.

### 6.4 conversationId

- MVP does not include `conversationId` in AppMessage.
- PebbleKit JS may keep an internal local conversation id if useful.
- The watch only tracks request id.

### 6.5 Key IDs

AppMessage uses fixed integer keys.

| Key ID | Name | Type | Direction |
| --- | --- | --- | --- |
| `1` | `type` | string | both |
| `2` | `requestId` | uint32 | both |
| `3` | `utterance` | string | watch -> JS |
| `4` | `status` | string | JS -> watch |
| `5` | `answer` | string | JS -> watch |
| `6` | `errorCode` | string | JS -> watch |
| `7` | `message` | string | JS -> watch |
| `8` | `hasApiKey` | uint8 bool | JS -> watch |

The `cancel` request sends only `type` and `requestId`.

## 7. Payload Limits

### 7.1 Utterance

- Initial safe limit: UTF-8 512 bytes.
- This is not a fixed AppMessage limit.
- It is an MVP safety target based on minimum outbox size, dictionary overhead, and request metadata.
- The watch checks and truncates before sending.
- Truncation must not break UTF-8 character boundaries.
- The watch does not tell the user when an utterance is shortened.
- The watch stores only the actual shortened utterance that was sent for retry.
- The watch does not keep a long raw Dictation result after sending.
- Implementation must verify real limits with `app_message_outbox_size_maximum()` and dictionary buffer calculations.

### 7.2 Answer

- Display limit: 240 characters.
- Applies to all configured answer languages.
- Initial AppMessage safe limit: UTF-8 768 bytes.
- This is not a fixed AppMessage limit.
- PebbleKit JS truncates answer before sending to the watch if either character or byte limit is exceeded.
- If truncated, append `...`.
- The final `...` is included within both character and byte limits.
- Implementation must verify real limits with `app_message_inbox_size_maximum()` and dictionary buffer calculations.

## 8. Conversation Memory

- Stored in PebbleKit JS runtime memory only.
- Not persisted to localStorage.
- Cleared when PebbleKit JS or the Pebble mobile app runtime restarts.
- Cleared when API key is deleted.
- Cleared when `Reset conversation memory` is pressed in configuration UI.

Memory update rule:

- Add memory only after a successful AI answer is sent to the watch for an active, non-canceled request.
- In MVP, successful `answer` AppMessage send is treated as displayed-equivalent.
- Add:
  - user utterance
  - shortened assistant answer
- Do not add failed, timed out, canceled, or stale attempts.
- Do not add an `answer_ack` protocol in MVP.

Retry behavior:

- Retryable errors resend the previously sent shortened utterance.
- Retry uses a new `requestId`.
- Failed attempts are not added to memory.
- If retry succeeds, add that successful user + assistant pair to memory.

Memory depth:

- Default: 2.
- Configurable: 0, 1, 2, 3.

## 9. Logging and Measurement

Do not log:

- OpenRouter API key.
- Raw user utterance.
- AI answer text.
- Raw provider error body if it may contain sensitive content.

Allowed logs:

- requestId.
- State transitions.
- Coarse errorCode.
- Elapsed time.
- Payload byte length.

Latency measurement:

- Measure per requestId.
- Start: Dictation result accepted / request send start.
- End:
  - answer displayed
  - error displayed
  - timeout
- Do not show latency on the watch UI.

Latency acceptance target:

- Normal Q&A.
- 20 attempts.
- Successful cases:
  - p50 <= 10 seconds.
  - p90 <= 12 seconds.
- Default timeout: 12 seconds.
- Timeout cases are excluded from successful-case latency and counted separately as timeout rate.

## 10. Visual Style

Typography:

- Use standard Pebble text size as the default.
- Do not shrink answer text just to fit more content.
- Answer screen scrolls instead.

Color semantics:

- Startup / Loading: neutral.
- Idle / Ask Pebble: blue leaning slightly teal.
- Thinking: purple.
- Answer: pale cyan background, black text.
- Error: red.
- Missing API key / setup: orange or yellow.

Colors are specified semantically here. Implementation should map them to nearby Pebble SDK standard colors and adjust after real device inspection.

## 11. Out of Scope for MVP

- Direct Groq API mode.
- Multiple provider selection.
- OpenRouter fallback to non-Groq providers.
- Web search setting or web-search-enabled answers.
- Speaker/tone feedback.
- TTS or PCM streaming.
- Long-form answer browsing.
- Watch-side conversation reset.
- Displaying latency on the watch.
