# CLAUDE.md — community-routes

## What This Project Is

A proof-of-concept **community-driven route builder for bikepacking and outdoor recreation**. The idea: people contribute routes via pull requests, and GitHub automatically renders them as interactive maps for review. Inspired by a Reddit discussion about collaborative route building.

## How It Works

1. Routes are stored in `/routes/` as `.gpx` and `.geojson` files
2. When a PR is opened or a push is made, a GitHub Actions workflow fires
3. The workflow posts a GeoJSON map preview as a comment on the PR using GitHub's native GeoJSON rendering
4. Reviewers can visually inspect the route before merging

## Directory Structure

```
community-routes/
├── routes/                          # Geographic route data
│   ├── *.gpx                        # GPS Exchange Format (source format)
│   └── *.geojson                    # GeoJSON format (used for rendering)
├── .github/
│   └── workflows/
│       ├── pull-request.yml         # CI workflow: posts GeoJSON preview on PRs
│       └── template.md              # GeoJSON data embedded as a PR comment template
└── README.md
```

## Route Data Formats

**GPX** — source/authoring format, XML-based, widely supported by GPS devices and apps like Garmin, Strava, Komoot.

**GeoJSON** — rendering format, used by GitHub's map preview and tools like geojson.io. Coordinates are `[longitude, latitude, elevation_meters]`.

To convert GPX → GeoJSON, use [togeojson](https://github.com/mapbox/togeojson):
```bash
npx @mapbox/togeojson route.gpx > route.geojson
```

## GitHub Actions Workflow

**File**: `.github/workflows/pull-request.yml`

- Triggers on: `push`, `pull_request`
- Uses `harupy/comment-on-pr` to post the contents of `template.md` as a PR comment
- Requires a GitHub secret: `PAT_TIL_JUNE_5` (a Personal Access Token — note: this has a limited expiration and will need renewal)

## Contributing a Route

1. Fork the repo
2. Add your route file(s) to `/routes/` (both `.gpx` and `.geojson` preferred)
3. Open a PR — the bot will automatically comment with a rendered map preview
4. Collaborators review the route visually and merge

## Status

Early proof-of-concept. The automation is minimal and the GPX→GeoJSON conversion is currently manual. Potential next steps noted in the original project:
- Auto-convert GPX to GeoJSON in CI
- Build a web UI with [Leaflet](https://leafletjs.com/) + [leaflet-omnivore](https://github.com/mapbox/leaflet-omnivore)
- Add route metadata (difficulty, distance, elevation profile)
