# Backend Architecture Proposal: Community Routes (Non-GitHub)

## Overview

This proposal replaces the GitHub fork/PR workflow with a purpose-built backend that non-technical users can interact with through a standard web UI. The design prioritizes simplicity in deployment and maintenance over raw scalability, appropriate for a community project that will grow incrementally.

---

## 1. Tech Stack

**Runtime & Framework: Node.js with Hono**

Hono is a lightweight, TypeScript-first web framework with excellent edge/serverless compatibility and a small surface area. It avoids the complexity of NestJS while being more structured than raw Express. TypeScript throughout keeps the data model honest and aligns with the SvelteKit frontend.

**Database: PostgreSQL with PostGIS**

Route data is fundamentally geographic. PostGIS adds spatial indexing and geometry functions (bounding box queries, length calculations, spatial intersections) that would otherwise require application-level workarounds. PostgreSQL's JSONB columns handle the GeoJSON FeatureCollection payloads natively while still allowing indexed queries on metadata fields. This is one database that handles both relational data (users, proposals, comments) and geospatial queries without a separate spatial store.

**Object Storage: Cloudflare R2 (or any S3-compatible store)**

Photos and original GPX file uploads go to object storage, not the database. R2 has no egress fees, which matters when serving map photos. The S3-compatible API means the same code works against MinIO in local development.

**Auth: Lucia Auth (session-based) + Arctic for OAuth**

Lucia is a server-side session library that works with any database. Arctic provides OAuth 2.0 client implementations (Google, GitHub if desired). Email/password login with Argon2 hashing covers users who do not want social login. Sessions stored in PostgreSQL alongside application data — no separate Redis dependency for an early-stage project.

**Background Jobs: pg-boss**

pg-boss uses PostgreSQL as a job queue, eliminating the need for Redis or a separate message broker. Used for: sending email notifications, generating route thumbnails, computing route statistics (distance, elevation gain) after proposal merge.

**Full Stack Summary:**

| Layer | Choice | Rationale |
|---|---|---|
| API framework | Hono (Node.js/TypeScript) | Lightweight, typed, edge-ready |
| Database | PostgreSQL 16 + PostGIS | Spatial queries, JSONB, single dependency |
| Object storage | Cloudflare R2 | S3-compatible, no egress cost |
| Auth | Lucia + Arctic | Session-based, DB-native |
| Job queue | pg-boss | No Redis needed |
| Email | Resend | Simple API, good deliverability |

---

## 2. Data Model

All geometry stored as PostGIS `geometry(GeometryCollection, 4326)` columns alongside the raw GeoJSON JSONB for direct serialization to clients. The JSONB copy is the source of truth for rendering; the PostGIS column enables spatial queries.

### `users`

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
email           text UNIQUE NOT NULL
email_verified  boolean NOT NULL DEFAULT false
password_hash   text                        -- null for OAuth-only accounts
display_name    text NOT NULL
avatar_url      text
role            text NOT NULL DEFAULT 'contributor'  -- 'contributor' | 'maintainer' | 'admin'
created_at      timestamptz NOT NULL DEFAULT now()
```

### `sessions`

Managed by Lucia. Stores session tokens linked to `users.id` with expiry timestamps.

### `oauth_accounts`

```
provider        text NOT NULL               -- 'google' | 'github'
provider_id     text NOT NULL
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
PRIMARY KEY (provider, provider_id)
```

### `routes`

A route is the canonical, merged record. Think of this as the `main` branch equivalent.

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
slug            text UNIQUE NOT NULL        -- URL-safe name, e.g. 'lost-coast-trail'
title           text NOT NULL
description     text
region          text                        -- e.g. 'California Coast'
difficulty      text                        -- 'easy' | 'moderate' | 'hard' | 'expert'
surface_type    text[]                      -- ['gravel', 'singletrack', 'pavement']
distance_meters numeric
elevation_gain_meters numeric
geojson         jsonb NOT NULL              -- current canonical GeoJSON FeatureCollection
geometry        geometry(GeometryCollection, 4326)  -- PostGIS copy for spatial ops
bounding_box    box2d                       -- derived, for map viewport queries
created_by      uuid NOT NULL REFERENCES users(id)
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
version         integer NOT NULL DEFAULT 1  -- increments on each accepted proposal
status          text NOT NULL DEFAULT 'active'  -- 'active' | 'archived'
```

### `route_versions`

Append-only log of every accepted state of a route. This is the versioning mechanism — a full snapshot on each merge, not a diff.

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
route_id        uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE
version         integer NOT NULL
geojson         jsonb NOT NULL
merged_from_proposal_id  uuid               -- FK to proposals, set on merge
merged_by       uuid NOT NULL REFERENCES users(id)
merged_at       timestamptz NOT NULL DEFAULT now()
change_summary  text                        -- maintainer-written note on what changed
UNIQUE (route_id, version)
```

### `proposals`

The PR equivalent. A proposal holds a complete replacement GeoJSON for the route (not a diff — the diff is computed at display time by comparing with the current route).

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
route_id        uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE
title           text NOT NULL
description     text
proposed_geojson  jsonb NOT NULL            -- full replacement FeatureCollection
proposed_geometry geometry(GeometryCollection, 4326)
author_id       uuid NOT NULL REFERENCES users(id)
status          text NOT NULL DEFAULT 'open'  -- 'open' | 'merged' | 'rejected' | 'superseded'
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
reviewed_by     uuid REFERENCES users(id)
reviewed_at     timestamptz
review_note     text                        -- maintainer's rejection/merge rationale
base_version    integer NOT NULL            -- which route version this was based on
```

`base_version` is critical: when a proposal is opened, the current `routes.version` is recorded. If another proposal merges first and advances the version, the system can flag the proposal as potentially conflicting (version mismatch), prompting the maintainer to review carefully.

### `waypoints`

Named points of interest associated with a route, managed independently of the main GeoJSON linestring.

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
route_id        uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE
name            text NOT NULL
description     text
category        text                        -- 'water' | 'camp' | 'resupply' | 'hazard' | 'poi'
location        geometry(Point, 4326) NOT NULL
elevation_meters numeric
added_by        uuid NOT NULL REFERENCES users(id)
created_at      timestamptz NOT NULL DEFAULT now()
```

### `photos`

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
route_id        uuid REFERENCES routes(id) ON DELETE SET NULL
proposal_id     uuid REFERENCES proposals(id) ON DELETE SET NULL
waypoint_id     uuid REFERENCES waypoints(id) ON DELETE SET NULL
uploader_id     uuid NOT NULL REFERENCES users(id)
storage_key     text NOT NULL               -- R2 object key
original_filename text
caption         text
location        geometry(Point, 4326)       -- GPS coords from EXIF if available
taken_at        timestamptz                 -- from EXIF
created_at      timestamptz NOT NULL DEFAULT now()
```

At least one of `route_id`, `proposal_id`, or `waypoint_id` must be non-null (enforced via CHECK constraint).

### `comments`

Polymorphic via `target_type` / `target_id` to avoid a separate table per entity.

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
target_type     text NOT NULL               -- 'proposal' | 'route' | 'waypoint'
target_id       uuid NOT NULL
author_id       uuid NOT NULL REFERENCES users(id)
body            text NOT NULL
parent_id       uuid REFERENCES comments(id)  -- for threaded replies
created_at      timestamptz NOT NULL DEFAULT now()
edited_at       timestamptz
deleted_at      timestamptz                 -- soft delete
```

### `notifications`

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
type            text NOT NULL               -- 'proposal_comment' | 'proposal_merged' | etc.
payload         jsonb NOT NULL              -- {route_id, proposal_id, actor_display_name, ...}
read_at         timestamptz
created_at      timestamptz NOT NULL DEFAULT now()
```

---

## 3. API Shape

The API is REST + JSON. All routes require authentication except public read endpoints. Version prefix: `/api/v1`.

### Auth

```
POST   /api/v1/auth/register              email, password, display_name
POST   /api/v1/auth/login                 email, password → sets session cookie
POST   /api/v1/auth/logout
GET    /api/v1/auth/session               returns current user or 401
GET    /api/v1/auth/oauth/:provider       redirect to OAuth provider
GET    /api/v1/auth/oauth/:provider/callback
```

### Routes

```
GET    /api/v1/routes                     list routes (bbox, region, difficulty filters)
POST   /api/v1/routes                     create new route [maintainer+]
GET    /api/v1/routes/:slug               get current route with metadata
PATCH  /api/v1/routes/:slug               update metadata only [maintainer+]
GET    /api/v1/routes/:slug/geojson       returns raw GeoJSON FeatureCollection
GET    /api/v1/routes/:slug/versions      list version history
GET    /api/v1/routes/:slug/versions/:v   get GeoJSON at a specific version
GET    /api/v1/routes/:slug/waypoints     list waypoints for a route
POST   /api/v1/routes/:slug/waypoints     add waypoint [authenticated]
GET    /api/v1/routes/:slug/photos        list photos
POST   /api/v1/routes/:slug/photos        upload photo (multipart) [authenticated]
GET    /api/v1/routes/:slug/comments      list comments
POST   /api/v1/routes/:slug/comments      post comment [authenticated]
```

The `GET /api/v1/routes` list endpoint accepts a `bbox` query parameter (`?bbox=west,south,east,north`) and uses PostGIS `&&` operator against the `bounding_box` column for spatial filtering.

### Proposals

```
GET    /api/v1/routes/:slug/proposals           list proposals (status filter)
POST   /api/v1/routes/:slug/proposals           open new proposal [authenticated]
GET    /api/v1/routes/:slug/proposals/:id       get proposal detail + diff metadata
PATCH  /api/v1/routes/:slug/proposals/:id       update proposed GeoJSON [author, open only]
DELETE /api/v1/routes/:slug/proposals/:id       withdraw proposal [author or maintainer]

POST   /api/v1/routes/:slug/proposals/:id/merge    [maintainer only]
POST   /api/v1/routes/:slug/proposals/:id/reject   [maintainer only] — body: {reason}

GET    /api/v1/routes/:slug/proposals/:id/diff     returns diff metadata (see section 4)
GET    /api/v1/routes/:slug/proposals/:id/comments
POST   /api/v1/routes/:slug/proposals/:id/comments [authenticated]
POST   /api/v1/routes/:slug/proposals/:id/photos   upload photo supporting a proposal
```

### Upload

```
GET    /api/v1/upload/presign        get presigned R2 URL for direct browser upload
                                     ?type=photo&route_id=...
POST   /api/v1/upload/gpx            server-side GPX→GeoJSON conversion endpoint
                                     multipart, returns converted GeoJSON
```

The `/upload/gpx` endpoint accepts a `.gpx` file and runs `@mapbox/togeojson` server-side, returning the GeoJSON for the client to review before submitting a proposal. This automates the conversion step that is currently manual.

### Admin

```
GET    /api/v1/admin/users
PATCH  /api/v1/admin/users/:id       change role, ban
GET    /api/v1/admin/proposals       queue of all open proposals across all routes
```

---

## 4. Versioning and Change Proposals Without Git

### The Core Mechanism

Instead of Git commits and diffs, the system uses **full-snapshot versioning** with **server-computed geometric diffs**.

When a proposal is created, the client submits a complete replacement `GeoJSON FeatureCollection`. The server stores it in `proposals.proposed_geojson` and records which `routes.version` it was based on (`base_version`). Nothing is computed at write time — storage is cheap.

When a maintainer opens a proposal for review (or when the frontend renders the proposal detail page), the server calls `GET /api/v1/routes/:slug/proposals/:id/diff`, which returns:

```json
{
  "base_version": 3,
  "current_version": 4,
  "version_conflict": true,
  "stats": {
    "added_coordinates": 142,
    "removed_coordinates": 38,
    "length_delta_meters": 1240,
    "bounding_box_changed": true
  },
  "added_segments": { "type": "FeatureCollection", "features": ["..."] },
  "removed_segments": { "type": "FeatureCollection", "features": ["..."] },
  "unchanged_segments": { "type": "FeatureCollection", "features": ["..."] }
}
```

The diff is computed by the server using turf.js line segment comparison: lines present in `proposed_geojson` but not in the current route become `added_segments` (rendered green on the map); lines present in the current route but not in the proposal become `removed_segments` (rendered red). The SvelteKit frontend renders all three layers simultaneously using MapLibre GL JS layer styling — the same technique GitHub uses internally for its GeoJSON diff view, but under your control.

### Version Conflict Detection

If `proposal.base_version < routes.current_version`, the proposal was opened against an older version. The system does not automatically reject it — the route geometry may not have changed in the conflicting area — but it surfaces a `version_conflict: true` flag prominently in the UI and in the diff response. The maintainer decides whether the conflict is material.

### Merge Sequence

When a maintainer clicks Merge:

1. API receives `POST /api/v1/routes/:slug/proposals/:id/merge`
2. Server opens a database transaction
3. Inserts a row into `route_versions` capturing the current `routes.geojson` and the proposal that replaced it
4. Updates `routes.geojson`, `routes.geometry`, `routes.bounding_box`, `routes.version` (incremented), `routes.updated_at`
5. Sets `proposals.status = 'merged'`, records `reviewed_by`, `reviewed_at`
6. Any other `open` proposals against this route get their `base_version` compared to the new version — the UI will flag them as potentially conflicting on next view
7. Commits transaction
8. Enqueues a pg-boss job to notify the proposal author and route watchers

### Why Full Snapshots Instead of Diffs

Storing diffs (the delta between versions) would make the database rows smaller but would require replaying diffs to reconstruct any historical state. For geographic data where the payload is typically 50–500 KB of GeoJSON, full snapshots are practical. A route with 100 accepted proposals uses at most ~50 MB of version storage — well within PostgreSQL's comfortable range. Reconstruction of any historical version is a single row lookup, not a diff replay chain.

---

## 5. Hosting and Deployment

### Recommended: Fly.io (Primary) + Cloudflare R2 (Storage)

**Why Fly.io:** Persistent PostgreSQL with PostGIS support, simple Docker-based deploys, built-in private networking between app and database, reasonable free tier for early traffic, no vendor lock-in on the application code.

**Deployment topology:**

```
Cloudflare (DNS + CDN)
    ↓
Fly.io App (Hono API, 2x 256MB machines, auto-scale to 0 off-hours)
    ↓
Fly.io Postgres (PostGIS enabled, 1GB volume, daily snapshots)
    ↓
Cloudflare R2 (photos, GPX originals — accessed via presigned URLs)
```

**SvelteKit Frontend:** Deploy to Cloudflare Pages (free, global CDN, integrates with R2). The SvelteKit app calls the Fly.io API directly.

**Local Development:**

```
Docker Compose:
  - postgres:16 with PostGIS
  - MinIO (S3-compatible, replaces R2 locally)
  - App server (tsx watch for hot reload)
```

### Cost Estimate (Early Stage)

| Service | Cost |
|---|---|
| Fly.io Machines (2 shared-cpu-1x) | ~$5/month |
| Fly.io Postgres (1GB) | ~$5/month |
| Cloudflare R2 (10GB storage, free egress) | ~$0.15/month |
| Cloudflare Pages (frontend) | Free |
| Resend (100 emails/day free) | Free |
| **Total** | **~$10–11/month** |

---

## 6. Trade-offs vs the GitHub-Backed Approach

### What the GitHub Approach Gets for Free

| Capability | GitHub | This Proposal |
|---|---|---|
| Version history with diffs | Built-in, Git-native | Custom snapshot log + computed diff |
| Auth / user accounts | GitHub login | Must build and maintain |
| Abuse prevention | GitHub's trust network | Must implement rate limits, email verification |
| PR review UI | Polished, familiar to developers | Must build custom review UI |
| Map preview rendering | Native GeoJSON support in comments | Must build MapLibre integration |
| Hosting | GitHub-hosted (free) | ~$10/month |
| Maintenance burden | GitHub maintains the platform | You maintain the API, DB, auth |

### What This Proposal Gains

| Capability | GitHub | This Proposal |
|---|---|---|
| User accessibility | Requires GitHub account | Email signup, no technical knowledge needed |
| Proposal UI | Fork + edit files + open PR | Web form with map editor |
| GPX upload | Manual conversion | Server-side auto-conversion |
| Waypoint management | Embedded in GeoJSON only | First-class database objects |
| Photo attachments | Not natively supported in PRs | Built-in, geotagged |
| Custom notifications | GitHub notifications only | Targeted email by route/interest |
| Moderation tools | Limited | Ban, role system, soft delete |
| Map diff quality | GitHub's renderer (limited control) | Full control via MapLibre layers |
| Offline/local dev | Depends on GitHub API | Fully self-hostable |

### Key Risks

**Complexity:** The GitHub approach delegates auth, versioning, diff rendering, and hosting to a platform. This proposal requires building and operating all of those. A solo maintainer should seriously consider whether the added accessibility is worth the maintenance load.

**Cold-start problem:** GitHub-backed routes are publicly visible immediately and indexed by search. A self-hosted instance starts with zero discoverability.

**Conflict resolution is simplified:** Git's three-way merge is genuinely sophisticated. This proposal's "flag the version mismatch and let the maintainer decide" approach is coarser. For routes with high proposal volume, two proposals modifying different segments of the same route cannot be automatically merged — a maintainer must manually reconcile. In practice, most community routes will not have concurrent proposals, so this is an acceptable simplification.

**Session management:** The GitHub approach offloads all auth security to GitHub. Running your own auth means you are responsible for secure session handling, password reset flows, email verification, and eventually rate limiting login attempts.

### Recommendation

If the contributor base is primarily technical users (developers, cyclists who use GitHub), stay with the GitHub approach — the cost/benefit is excellent. Build this custom backend only when the community grows to include users who find GitHub intimidating, or when features like geotagged photos and structured waypoints become necessary. The two approaches are not mutually exclusive: you could keep GitHub as a contributor path and add this API as a second path, using the same route data stored in the database as the source of truth.

---

*Prepared for: community-routes proof-of-concept*
*Date: 2026-03-21*
