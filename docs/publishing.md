# Ask Pebble Publishing Notes

Ask Pebble should be published as an experimental Android-only BYOK app.

## Store / Portal

- Upload portal: https://dev-portal.rebble.io/
- Store name to use in user-facing copy: Rebble store
- Compatibility wording: Pebble watchapp / Pebble appstore is still used in
  Rebble documentation, but new releases are managed through the Rebble
  Developer Portal.
- Ecosystem note: Core Devices also has a Pebble app/appstore feed at
  https://apps.repebble.com/ and developer docs at
  https://developer.repebble.com/. Rebble announced in October 2025 that
  uploads through the Rebble Developer Portal should appear in both appstores,
  but the Core/Rebble appstore relationship has changed publicly since then.
  For first release, publish through Rebble first, then verify visibility in
  the Core Pebble app / apps.repebble.com and submit or claim there separately
  only if needed.

## App Metadata

- App name: Ask Pebble
- Author: Katsuya Ohta
- Platform: Pebble watchapp
- Category: Tools & Utilities
- Primary phone OS: Android
- Provider: OpenRouter
- Auth model: BYOK
- Supported platforms: Flint / Pebble 2 Duo, Emery / Pebble Time 2

## Short Store Description

Ask Pebble is an experimental Android-only voice Q&A app for Pebble. Speak a
question on your watch, send it through your paired Android phone, and read a
short AI answer on the Pebble screen.

Requires your own OpenRouter API key. No developer API key is included.

## Longer Store Description

Ask Pebble turns Pebble Dictation into a compact AI Q&A flow. Press Select,
speak a question, and the app sends the recognized text from PebbleKit JS on
your paired Android phone to OpenRouter. The response is shortened for the
watch screen.

This is a BYOK app: you must enter your own OpenRouter API key in settings.
Usage costs, credits, rate limits, and model access are handled by your own
OpenRouter account.

Optional context features are available in settings. Time context is enabled by
default. Location and health context are opt-in. Health context can include
today's steps, active minutes, sleep minutes, and restful sleep minutes when
available from Pebble Health.

This app is experimental and Android only. iOS is not supported or tested.

## Store Warning / Compatibility Text

- Android only.
- OpenRouter API key required.
- No developer API key is included.
- OpenRouter usage may cost money depending on your selected model and account.
- Location and health context are opt-in.
- Experimental app; provider availability, model behavior, dictation, and
  network conditions can affect results.

## Suggested Changelog For First Public Release

Initial experimental public release.

- Voice Q&A using Pebble Dictation
- OpenRouter BYOK settings
- Recommended model selector and custom model id
- Short answer display on watch
- Conversation memory setting
- Optional time, location, and health context
- API key deletion and memory reset controls

## Pre-Publish Checklist

- App name is consistently `Ask Pebble`.
- Author is `Katsuya Ohta`.
- Build produces `build/pebble.pbw`.
- Release upload filename is `ask-pebble.pbw`.
- Android install has been tested.
- API key setup has been tested.
- API key deletion has been tested.
- A successful voice Q&A has been tested.
- Missing key, invalid key, network failure, timeout, and invalid model errors
  show short watch messages.
- Location and health context are disabled by default.
- Store copy clearly says Android only, BYOK, and experimental.
- No API key is committed or bundled.
- README and privacy note are included in the repository.
