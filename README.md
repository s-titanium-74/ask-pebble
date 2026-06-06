# Ask Pebbpe

Ask Pebbpe is a Pebble voice Q&A proof of concept.

## Build

The repository includes a Docker Compose configuration for building with the Rebble Pebble SDK image.

```sh
docker compose run --rm pebble-sdk
```

The compiled PBW is written to `build/pebble.pbw`.

See `docs/build.md` for the reproducible Docker build details.
