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
- OpenRouter provider route: Groq only.
- Provider fallback: off.
- Direct Groq API is not the MVP path. It remains a future comparison or alternative path.

Conceptual OpenRouter request behavior:

```json
{
  "model": "meta-llama/llama-3.1-8b-instruct",
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

- `meta-llama/llama-3.1-8b-instruct`

Recommended model dropdown:

- `meta-llama/llama-3.1-8b-instruct`
- `meta-llama/llama-3.3-70b-instruct`
- `openai/gpt-oss-20b`

Before implementation, each dropdown model must be verified against OpenRouter REST API with Groq-only routing and fallback disabled. Any model that does not work with `provider.only: ["groq"]` and `provider.allow_fallbacks: false` must be removed from the dropdown. The default model must also be one of the verified working models.

Custom model id:

- If empty, use the dropdown value.
- If non-empty, custom model id takes priority.
- When custom model id is active, show `Using custom model` in the configuration UI.

## 3. Watch UI

### 3.1 Startup

On launch:

1. Show `Loading...`.
2. Watch sends a key state request to PebbleKit JS.
3. PebbleKit JS returns whether an OpenRouter API key is saved.

If key is saved:

- Main: `Ask AI`
- Sub: `Select to speak`

If key is missing:

- Main: `Set API key`
- Sub: `Open settings`

If key state check fails:

- Show `Connection failed`.
- Select retries the key state request.
- While retrying, show `Loading...`.

After returning from the configuration UI, or when the watchapp regains focus, automatically request key state again. If the retry succeeds and a key is saved, transition to Idle / Ready. If the key is still missing, return to the missing-key screen.

### 3.2 Idle / Ready

When API key is available:

- Main text: `Ask AI`
- Sub text: `Select to speak`
- Select starts Pebble Dictation.

The app does not show the previous answer on launch.

### 3.3 Missing API Key Help

When API key is missing:

- Main: `Set API key`
- Sub: `Open settings`
- Select shows a help screen.

Help screen:

- Main: `Open Pebble app`
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

- Show `Thinking...`.
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
- Background: white.
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
- `Route: Groq only`
- `Fallbacks: Off`

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

- `Japanese`
- `English`
- `Auto`

Default:

- `Japanese`

Language setting controls AI answer language and system instruction composition. It does not directly control Pebble Dictation recognition language.

Configuration note:

- `Language controls AI answers, not Pebble voice recognition.`

Auto behavior:

- If transcription contains Japanese characters, answer in Japanese.
- Otherwise, answer in English.

### 5.6 System Instruction

System instruction is composed from:

1. Base Pebble instruction.
2. Language instruction.
3. Optional custom system instruction.

Base instruction:

```text
Answer for a small smartwatch screen. Be concise, practical, and keep it under 240 characters.
```

Language instruction:

- Japanese: `Answer in Japanese.`
- English: `Answer in English.`
- Auto: `Detect the user's language from the message and answer in the same language.`

Custom system instruction:

- Empty value is allowed.
- If empty, use only base instruction plus language instruction.
- If non-empty, append it after the base and language instructions.

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

### 6.2 Response Type

AppMessage responses include `type`.

Response types:

- `key_state`
- `answer`
- `error`

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
- Idle / Ask AI: blue.
- Thinking: purple.
- Answer: white background, black text.
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
