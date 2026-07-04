# Advanced Tasker — sync server

A tiny Node/TypeScript service that syncs a project across devices by **merging whole
projects** with the same code the app uses locally (`src/sync/mergeProjects`). Projects
are small JSON, so full-project merge is simple and correct; we can move to incremental
sync later if needed.

## API

All routes except `/health` require `Authorization: Bearer $SYNC_TOKEN`.

| Method | Route               | Body            | Returns                                     |
| ------ | ------------------- | --------------- | ------------------------------------------- |
| GET    | `/health`           | —               | `{ ok: true }`                              |
| GET    | `/projects`         | —               | `[{ id, name }]` of all stored projects     |
| GET    | `/sync/:id`         | —               | the stored merged `ProjectFile` (404 unknown, **410 deleted**) |
| GET    | `/sync/:id/version` | —               | `{ version }` — cheap change-poll token     |
| POST   | `/sync/:id`         | a `ProjectFile` | that project **merged** with the server's (**410 if deleted** — push refused) |
| DELETE | `/sync/:id`         | —               | `{ ok: true }` — **tombstones** the row (data kept, `deleted_at` set). Pushes/pulls answer 410 from then on, so other devices are told instead of re-uploading. |

A tombstoned project's data stays in the row until you clean it up manually
(`delete from projects where deleted_at is not null` in the DB console), so an
accidental "delete everywhere" is recoverable by clearing `deleted_at`.

`:id` is the project's `ProjectFile.id`. On POST the server does, atomically:
load stored → `mergeProjects(stored, client)` → save → return merged. The client then
adopts the returned project.

## Run locally

```bash
cd server
cp .env.example .env.local          # fill in DATABASE_URL + SYNC_TOKEN
npm install
# load env then start (any method); e.g. with a dotenv runner or by exporting vars:
npm start
```

Then:

```bash
curl -s localhost:8080/health
curl -s -X POST localhost:8080/sync/<project-id> \
  -H "Authorization: Bearer $SYNC_TOKEN" -H 'content-type: application/json' \
  --data @some-project.json
```

## Deploy on Railway

The repo-root `Dockerfile` builds this service (and copies the shared `src/`). In the
Railway project:

1. **New → GitHub Repo** → pick this repo. Railway detects the `Dockerfile`.
2. Add service variables:
   - `DATABASE_URL = ${{ Postgres.DATABASE_URL }}` (reference the Postgres service)
   - `SYNC_TOKEN = <long random string>`  (same value the app will send)
3. **Settings → Networking → Generate Domain** to get a public URL.
4. Healthcheck path: `/health`.

The service reads `DATABASE_URL`, creates the `projects` table on boot, and listens on
`PORT` (injected by Railway).
