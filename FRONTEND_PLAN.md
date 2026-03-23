# Frontend Plan — Community Routes Web UI

## Stack

- **SvelteKit** (already scaffolded in `web/`)
- **MapLibre GL JS** — interactive map, OpenFreeMap Liberty tiles
- No additional dependencies needed (elevation profile via inline SVG)

## Current State (scaffolded)

- `+layout.svelte` — fixed header + flex body shell
- `+page.svelte` — fetches routes from API, wires sidebar + map
- `Map.svelte` — renders routes as lines/points, click-to-highlight (orange)
- `RouteList.svelte` — sidebar with route names, selected state
- `api/routes/+server.js` — reads all `.geojson` files, returns `{filename, name, geojson}`

## Remaining Features

### 1. Route Metadata Computation

Compute in the API endpoint (`+server.js`) so the client gets stats ready to display.

**Distance** — sum of Haversine distances between consecutive LineString coordinates.
Output: `distanceKm` (number, rounded to 1 decimal)

**Elevation gain** — sum of positive altitude deltas across all coordinates (index 2 of each coord).
Output: `elevationGainM` (number, rounded to integer)

**Elevation profile** — array of `{ d, ele }` points sampled from coordinates (downsample to ≤200 points).
Used to render the sparkline chart in the sidebar.
Output: `elevationProfile: Array<{ d: number, ele: number }>` where `d` is cumulative km

### 2. Route List — Stats Display

Each route item in `RouteList.svelte` shows below the route name:

```
42.3 km  ↑ 1,840 m
```

Small, muted text. Always visible (not just when selected).

### 3. Elevation Profile Sparkline

When a route is selected in the sidebar, show an inline SVG elevation profile chart below the stats.

- Rendered as a filled area path
- X-axis: distance (km), Y-axis: elevation (m)
- No axis labels — just the shape, with a tooltip on hover showing `{ele}m at {d}km`
- Dimensions: full sidebar width × 80px tall
- Color: matches route highlight color (#ff6b00 fill with opacity)

## Data Flow

```
+server.js
  reads .geojson
  computes distanceKm, elevationGainM, elevationProfile
  returns enriched route objects

+page.svelte
  fetches /api/routes
  passes routes → RouteList + Map

RouteList.svelte
  shows name + "42.3 km  ↑ 1,840 m" per route
  shows SVG sparkline when route is selected

Map.svelte
  (unchanged)
```

## File Changes

| File | Change |
|---|---|
| `api/routes/+server.js` | Add `computeStats(geojson)` → `{distanceKm, elevationGainM, elevationProfile}` |
| `RouteList.svelte` | Add stats row + sparkline SVG when selected |

No other files need to change.
