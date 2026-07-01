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
}

/** The stored merged project, or null if this device is the first to sync it. */
export async function getProject(id: string): Promise<ProjectFile | null> {
  const { rows } = await pool.query('select data from projects where id = $1', [id]);
  return rows.length ? (rows[0].data as ProjectFile) : null;
}

/**
 * Merge the client's project into the stored one (or store it fresh), atomically.
 * `select ... for update` locks the row so two devices syncing at once can't lose
 * an update — they serialize, and each sees the other's merged result.
 */
export async function syncProject(id: string, client: ProjectFile): Promise<ProjectFile> {
  const conn = await pool.connect();
  try {
    await conn.query('begin');
    const { rows } = await conn.query('select data from projects where id = $1 for update', [id]);
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
    return merged;
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
