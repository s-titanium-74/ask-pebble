# Ask Pebble Publishing Notes

Ask Pebble should be published as an experimental Android-only BYOK app.

## Store / Portal

- Upload portal: https://dev-portal.rebble.io/
- Rebble store listing: https://apps.rebble.io/en_US/application/6a2764f6d2556100093bfbf5
- Core Pebble appstore listing: https://apps.repebble.com/6a2764f6d2556100093bfbf5
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
- Providers: OpenRouter, OpenAI API, and custom OpenAI-compatible Chat
  Completions endpoints
- Auth model: BYOK
- Supported platforms: Flint / Pebble 2 Duo, Emery / Pebble Time 2

## Short Store Description

Ask Pebble is an experimental Android-only voice Q&A app for Pebble. Speak a
question on your watch, send it through your paired Android phone, and read a
short AI answer on the Pebble screen.

Requires your own API key for the endpoint selected in settings. No developer
API key is included.

## Longer Store Description

Ask Pebble turns Pebble Dictation into a compact AI Q&A flow. Press Select,
speak a question, and the app sends the recognized text from PebbleKit JS on
your paired Android phone to the API endpoint selected in settings. The response
is shortened for the watch screen.

This is a BYOK app: you must enter an API key for OpenRouter, OpenAI API, or a
custom OpenAI-compatible Chat Completions endpoint. Usage costs, credits, rate
limits, and model access are handled by your account with that provider.

Optional context features are available in settings. Time context is enabled by
default. Location and health context are opt-in. Health context can include
today's steps, active minutes, sleep minutes, and restful sleep minutes when
available from Pebble Health.

This app is experimental and Android only. iOS is not supported or tested.

## Store Warning / Compatibility Text

- Android only.
- API key required for the selected endpoint.
- No developer API key is included.
- Provider usage may cost money depending on your selected model and account.
- Location and health context are opt-in.
- Experimental app; provider availability, model behavior, dictation, and
  network conditions can affect results.

## Suggested Changelog For First Public Release

Initial experimental public release.

- Voice Q&A using Pebble Dictation
- Endpoint-specific BYOK settings for OpenRouter, OpenAI API, and custom
  OpenAI-compatible endpoints
- Recommended model selector and custom model id
- Short answer display on watch
- Conversation memory setting
- Optional time, location, and health context
- API key deletion and memory reset controls

## Suggested Changelog For v1.0.2

- Fix Android Settings failing to open when the bundled configuration page
  contains a character that cannot be encoded by `btoa()`.
- Keep the configuration page phone-local and reduce its generated URL size.

## Pre-Publish Checklist

- App name is consistently `Ask Pebble`.
- Author is `Katsuya Ohta`.
- Build produces `build/pebble.pbw`.
- Release upload filename is `ask-pebble.pbw`.
- Android install has been tested.
- API key setup has been tested.
- Changing endpoint requires entering a new API key.
- API key deletion has been tested.
- A successful voice Q&A has been tested.
- Missing key, invalid key, network failure, timeout, and invalid model errors
  show short watch messages.
- Location and health context are disabled by default.
- Store copy clearly says Android only, BYOK, and experimental.
- No API key is committed or bundled.
- README and privacy note are included in the repository.
