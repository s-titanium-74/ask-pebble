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

- builds `Dockerfile.pebble-sdk`
- installs Core/RePebble `pebble-tool`
- installs Pebble SDK `4.9.169`
- mounts this repository at `/pebble`
- runs `pebble build` in `/pebble`

## SDK Image

`compose.yaml` builds a local image:

```text
ask-pebble-sdk:4.9.169
```

The image is built from `Dockerfile.pebble-sdk` because the older
`rebble/pebble-sdk` Docker image does not include the `flint` platform needed
for Pebble 2 Duo.

The Dockerfile pins the Ubuntu base image, Ubuntu package snapshot, uv,
Pebble Tool, Python, and Pebble SDK versions so release builds use the same
toolchain. Update these pins deliberately when refreshing the build image.

To intentionally update the SDK version:

1. Change the pinned values at the top of `Dockerfile.pebble-sdk` and the
   `pebble sdk install` version together.
2. Change the local image tag in `compose.yaml`.
3. Rebuild and verify that `build/pebble.pbw` contains both `flint/` and
   `emery/` platform directories.

## Direct Docker Command

If Docker Compose is not available, build the local SDK image first, then run
the equivalent command:

```sh
docker build -f Dockerfile.pebble-sdk -t ask-pebble-sdk:4.9.169 .

docker run --rm \
  -v "$PWD:/pebble" \
  -w /pebble \
  ask-pebble-sdk:4.9.169 \
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

- `flint`
- `emery`

`flint` is the Pebble SDK platform for Pebble 2 Duo. `emery` is the Pebble SDK
platform for Pebble Time 2.

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

You can also check the generated platform directories under `build/flint` and
`build/emery`.
