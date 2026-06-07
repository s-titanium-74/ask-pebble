# Ask Pebble Privacy and Data Use

Ask Pebble is an Android-only Pebble watchapp that uses OpenRouter to answer
short voice questions. It is BYOK: users provide their own OpenRouter API key.

## Data Stored On The Phone

Ask Pebble stores these settings in phone-side PebbleKit JS storage:

- OpenRouter API key
- Response language
- Selected model or custom model id
- Timeout, output length, and memory depth settings
- Optional system instruction
- Time, location, and health context toggles

The OpenRouter API key is not sent to the watchapp. It is not embedded in the
PBW and no developer API key is included.

PebbleKit JS storage should be treated as client-side app storage, not strong
secret storage like Android Keystore. Users should create a dedicated OpenRouter
key for this app and revoke it if they stop using the app.

## Data Sent To OpenRouter

When the user asks a question, Ask Pebble may send the following to OpenRouter:

- The dictated question text
- A short system instruction for smartwatch-sized answers
- Recent conversation memory, depending on the memory depth setting
- Optional user-provided system instruction
- Enabled device context when needed

The app does not intentionally send raw audio. Speech-to-text is handled by
Pebble Dictation before Ask Pebble sends text to OpenRouter.

## Optional Context

Time context is enabled by default.

Location context is disabled by default. If the user enables it, Ask Pebble can
request the phone location when the model asks for location context.

Health context is disabled by default. If the user enables it, Ask Pebble can
request available Pebble Health data from the watch, currently:

- Today's steps
- Today's active minutes
- Today's sleep minutes
- Today's restful sleep minutes

Location and health context are opt-in and are only used when enabled in
settings and requested by the model flow.

## Logs

The app should not log API keys, full dictated questions, full AI answers, or
raw provider error bodies during normal use.

## User Responsibility

Users are responsible for their own OpenRouter account, credits, rate limits,
model access, and usage costs. Ask Pebble cannot control OpenRouter billing or
provider-side retention policies.
