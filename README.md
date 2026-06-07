# Ask Pebble

Ask Pebble is an experimental Android-only voice Q&A app for Pebble watches.
It uses Pebble Dictation for speech-to-text and calls OpenRouter from PebbleKit
JS on the paired Android phone.

This app is BYOK (Bring Your Own Key): you must provide your own OpenRouter API
key in the app settings. No developer API key is included.

## Status

- Experimental public release candidate
- Android only
- OpenRouter BYOK
- Pebble Time 2 is the primary target
- iOS is not supported or tested

## What It Does

1. Open Ask Pebble on the watch.
2. Press Select and speak a question.
3. The paired Android phone sends the text to OpenRouter.
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
- OpenRouter account and API key
- OpenRouter credits or access to the selected model

## Setup

1. Install the PBW.
2. Open the app settings from the Pebble mobile app.
3. Create or paste your OpenRouter API key.
4. Choose a response language and model.
5. Save settings.
6. Open Ask Pebble on the watch and press Select to ask a question.

OpenRouter links:

- API keys: https://openrouter.ai/settings/keys
- Credits and usage: https://openrouter.ai/settings/credits

## BYOK and Costs

Ask Pebble does not include a shared developer API key. Requests are sent using
the OpenRouter API key that you enter in settings.

You are responsible for:

- OpenRouter usage costs
- Credits, limits, and rate limits
- Revoking the key if you no longer want to use it
- Choosing a model that is available to your OpenRouter account

For safety, create a dedicated OpenRouter key for this app and set appropriate
OpenRouter spending limits where possible.

## Privacy

Ask Pebble stores the OpenRouter API key on the phone-side PebbleKit JS storage.
This is client-side storage, not strong secret storage like Android Keystore.

The app sends your dictated question, selected settings, short conversation
memory, and enabled device context to OpenRouter when needed to answer.

Location and health context are disabled by default and must be enabled in the
settings before they can be used.

See `docs/privacy.md` for the longer privacy and data-use note.

## Public Release Notes

Use these labels when publishing:

- Android only
- BYOK / OpenRouter API key required
- Experimental
- No developer API key included
- Optional location and health context are opt-in

Store listing copy and release checklist are in `docs/publishing.md`.

## Build

The repository includes a Docker Compose configuration for building with the Rebble Pebble SDK image.

```sh
docker compose run --rm pebble-sdk
```

The compiled PBW is written to `build/pebble.pbw`. For releases, use the
published filename `ask-pebble.pbw`.

See `docs/build.md` for the reproducible Docker build details.
