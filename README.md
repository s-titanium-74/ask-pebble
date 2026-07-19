# Ask Pebble

Ask Pebble is an experimental Android-only voice Q&A app for Pebble watches.
It uses Pebble Dictation for speech-to-text and calls the API endpoint selected
in PebbleKit JS on the paired Android phone.

This app is BYOK (Bring Your Own Key): you must provide an API key for the
selected endpoint. No developer API key is included.

## Status

- Experimental public release candidate
- Android only
- BYOK with OpenRouter, OpenAI API, or a custom OpenAI-compatible Chat
  Completions endpoint
- Pebble Time 2 is the primary target
- iOS is not supported or tested

## What It Does

1. Open Ask Pebble on the watch.
2. Press Select and speak a question.
3. The paired Android phone sends the text to the selected API endpoint.
4. A short answer is shown on the watch.

Optional context features can be enabled in settings:

- Time context is enabled by default.
- Location context is opt-in.
- Health context is opt-in.

Location and health data are only fetched when enabled and when the model asks
for that context. Health context currently covers today's steps, active minutes,
sleep minutes, and restful sleep minutes when available from Pebble Health.

## Requirements

- Pebble watch
- Android phone with a Pebble-compatible mobile app
- API account and key for the selected endpoint
- Credits, limits, or model access for the selected endpoint

## Setup

1. Install the PBW.
2. Open the app settings from the Pebble mobile app.
3. Select OpenRouter, OpenAI API, or a custom OpenAI-compatible Chat
   Completions endpoint.
4. Create or paste the API key for that endpoint, then choose a response
   language and model.
5. Save settings.
6. Open Ask Pebble on the watch and press Select to ask a question.

OpenRouter links, when OpenRouter is selected:

- API keys: https://openrouter.ai/settings/keys
- Credits and usage: https://openrouter.ai/settings/credits

## BYOK and Costs

Ask Pebble does not include a shared developer API key. Requests are sent using
the API key you enter for the selected endpoint.

You are responsible for:

- Usage costs for the selected endpoint
- Credits, limits, and rate limits
- Revoking the key if you no longer want to use it
- Choosing a model available to that account and endpoint

For safety, create a dedicated key for this app and set appropriate spending
limits where the provider supports them.

## Privacy

Ask Pebble stores the selected endpoint's API key on the phone-side PebbleKit JS
storage.
This is client-side storage, not strong secret storage like Android Keystore.

The app sends your dictated question, selected settings, short conversation
memory, and enabled device context to the selected endpoint when needed to
answer.

Location and health context are disabled by default and must be enabled in the
settings before they can be used.

See `docs/privacy.md` for the longer privacy and data-use note.

## Public Release Notes

Use these labels when publishing:

- Android only
- BYOK / API key required for the selected endpoint
- Experimental
- No developer API key included
- Optional location and health context are opt-in

Store listing copy and release checklist are in `docs/publishing.md`.

## Store Listings

- [Rebble store](https://apps.rebble.io/en_US/application/6a2764f6d2556100093bfbf5)
- [Core Pebble appstore](https://apps.repebble.com/6a2764f6d2556100093bfbf5)

## Build

The repository includes a Docker Compose configuration that builds a pinned
local Pebble SDK image.

```sh
docker compose run --rm pebble-sdk
```

The compiled PBW is written to `build/pebble.pbw`. For releases, use the
published filename `ask-pebble.pbw`.

See `docs/build.md` for the reproducible Docker build details.
