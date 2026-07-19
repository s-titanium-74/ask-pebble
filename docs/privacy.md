# Ask Pebble Privacy and Data Use

Ask Pebble is an Android-only Pebble watchapp that sends short voice questions
to the API endpoint selected by the user. It is BYOK: users provide their own
API key for OpenRouter, OpenAI API, or a custom OpenAI-compatible Chat
Completions endpoint.

## Data Stored On The Phone

Ask Pebble stores these settings in phone-side PebbleKit JS storage:

- Selected endpoint profile and, for custom endpoints, its full URL
- API key for the selected endpoint
- Response language
- Selected model or custom model id
- Timeout, output length, and memory depth settings
- Optional system instruction
- Time, location, and health context toggles

The API key is not sent to the watchapp. It is not embedded in the PBW and no
developer API key is included. The configuration-page URL receives only whether
an API key is saved, not the key itself.

PebbleKit JS storage should be treated as client-side app storage, not strong
secret storage like Android Keystore. Users should create a dedicated key for
this app and revoke it if they stop using the app.

## Data Sent To The Selected Endpoint

When the user asks a question, Ask Pebble may send the following to the selected
endpoint:

- The dictated question text
- A short system instruction for smartwatch-sized answers
- Recent conversation memory, depending on the memory depth setting
- Optional user-provided system instruction
- Enabled device context when needed

The app does not intentionally send raw audio. Speech-to-text is handled by
Pebble Dictation before Ask Pebble sends text to the selected endpoint.

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

Users are responsible for their own API account, credits, rate limits, model
access, and usage costs. Ask Pebble cannot control provider billing or
provider-side retention policies.
