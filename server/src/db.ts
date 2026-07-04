// Postgres access for the sync server. One table: `projects`, each row a whole
// merged ProjectFile (jsonb). The merge itself is the tested code shared from
// ../src — this file only handles persistence and the atomic read-merge-write.

import pg from 'pg';
import { mergeProjects } from '../../src/sync/project';
import { ensureOrderKeys } from '../../src/model/orderKey';
import type { ProjectFile } from '../../src/model/types';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's *internal* DATABASE_URL needs no SSL; set DATABASE_SSL=true only when
  // connecting over a public endpoint.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    create table if not exists projects (
      id         text primary key,
      owner      text,
      data       jsonb not null,
      updated_at timestamptz not null default now()
    );
  `);
  // Project tombstone: set instead of removing the row on DELETE, so a device that
  // still holds the project can't silently re-upload it. Data is retained.
  await pool.query('alter table projects add column if not exists deleted_at timestamptz;');
}

/** The stored row (project + tombstone state), or null if unknown. */
export async function getRow(
  id: string,
): Promise<{ project: ProjectFile; deletedAt: string | null } | null> {
  const { rows } = await pool.query('select data, deleted_at from projects where id = $1', [id]);
  if (!rows.length) return null;
  return {
    project: rows[0].data as ProjectFile,
    deletedAt: rows[0].deleted_at ? new Date(rows[0].deleted_at).toISOString() : null,
  };
}

/** The row's `updated_at` (ISO) for change-polling, or null if the project is unknown. */
export async function getVersion(id: string): Promise<string | null> {
  const { rows } = await pool.query('select updated_at from projects where id = $1', [id]);
  return rows.length ? new Date(rows[0].updated_at).toISOString() : null;
}

/**
 * Tombstone a project: keep the row (and its data — nothing is lost until a manual
 * cleanup) but mark it deleted, so pushes/pulls answer 410 from now on. Upserts a
 * bare tombstone when the project was never synced, so an id known to be deleted
 * stays dead even if a device pushes it for the first time later.
 */
export async function deleteProjectRow(id: string): Promise<void> {
  await pool.query(
    `insert into projects (id, data, updated_at, deleted_at) values ($1, '{}'::jsonb, now(), now())
     on conflict (id) do update set deleted_at = now(), updated_at = now()`,
    [id],
  );
}

/** All live (non-tombstoned) projects as `{ id, name }`, for the pull-by-id picker. */
export async function listProjects(): Promise<Array<{ id: string; name: string }>> {
  const { rows } = await pool.query(
    "select id, coalesce(data->>'name', id) as name from projects where deleted_at is null order by name",
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

export type SyncOutcome =
  | { deleted: true; deletedAt: string }
  | { deleted: false; project: ProjectFile };

/**
 * Merge the client's project into the stored one (or store it fresh), atomically.
 * `select ... for update` locks the row so two devices syncing at once can't lose
 * an update — they serialize, and each sees the other's merged result. A tombstoned
 * project refuses the push (`deleted: true`) so it can't be silently re-uploaded.
 */
export async function syncProject(id: string, client: ProjectFile): Promise<SyncOutcome> {
  const conn = await pool.connect();
  try {
    await conn.query('begin');
    const { rows } = await conn.query(
      'select data, deleted_at from projects where id = $1 for update',
      [id],
    );
    if (rows.length && rows[0].deleted_at) {
      await conn.query('commit');
      return { deleted: true, deletedAt: new Date(rows[0].deleted_at).toISOString() };
    }
    const server = rows.length ? (rows[0].data as ProjectFile) : null;
    // mergeProjects(server, client): server is "local", client "remote". The merge
    // is symmetric, so the argument order doesn't change the result.
    const merged = server ? mergeProjects(server, client) : normalize(client);
    await conn.query(
      `insert into projects (id, data, updated_at) values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [id, merged],
    );
    await conn.query('commit');
    return { deleted: false, project: merged };
  } catch (err) {
    await conn.query('rollback');
    throw err;
  } finally {
    conn.release();
  }
}

/** A first-seen project may come from an older client without order keys. */
function normalize(p: ProjectFile): ProjectFile {
  ensureOrderKeys(p.root.children);
  return p;
}
