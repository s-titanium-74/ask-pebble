# Build and Docker Environment

This project is a Pebble SDK app. The normal build output is a PBW package at:

```text
build/pebble.pbw
```

## Recommended Build

Use Docker Compose from the repository root:

```sh
docker compose run --rm pebble-sdk
```

The `pebble-sdk` service is defined in `compose.yaml`. It:

- uses the Rebble Pebble SDK Docker image
- pins the image by digest for reproducibility
- mounts this repository at `/pebble`
- runs `pebble build` in `/pebble`

## Pinned SDK Image

`compose.yaml` currently uses:

```text
rebble/pebble-sdk@sha256:ac6284b9764bfadc9ced945e95a84cdbaa23736ea14323655e6dafc5938dcaf3
```

This avoids silently changing compiler behavior when the `latest` tag is updated upstream.

To intentionally update the SDK image:

1. Pull the current image.

   ```sh
   docker pull rebble/pebble-sdk:latest
   ```

2. Inspect the digest.

   ```sh
   docker image inspect rebble/pebble-sdk:latest --format '{{json .RepoDigests}}'
   ```

3. Replace the digest in `compose.yaml`.
4. Rebuild and verify that `build/pebble.pbw` is produced.

## Direct Docker Command

If Docker Compose is not available, this is the equivalent direct command:

```sh
docker run --rm \
  -v "$PWD:/pebble" \
  -w /pebble \
  rebble/pebble-sdk@sha256:ac6284b9764bfadc9ced945e95a84cdbaa23736ea14323655e6dafc5938dcaf3 \
  pebble build
```

## What Gets Built

The build uses:

- `package.json` for Pebble metadata, target platforms, message keys, and resources
- `wscript` for Pebble SDK build rules
- `src/c/**/*.c` for the watchapp C sources
- `src/pkjs/**/*.js` and `src/common/**/*.js` for PebbleKit JS
- `resources/config.html` as the bundled configuration page

Configured target platforms are:

- `aplite`
- `basalt`
- `chalk`
- `diorite`

## Clean Build

Generated files are ignored by git. To force a fresh build:

```sh
rm -rf build .lock-waf*
docker compose run --rm pebble-sdk
```

If `build/` is owned by a different user because it was created by Docker, remove it with the permissions available on the host or rebuild in a container that writes with the desired user id.

## Expected Success Signal

A successful build leaves this file:

```text
build/pebble.pbw
```

For public release uploads, use `ask-pebble.pbw` as the published filename.

You can also check the generated platform directories under `build/aplite`, `build/basalt`, `build/chalk`, and `build/diorite`.
