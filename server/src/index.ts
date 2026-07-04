// Advanced Tasker sync server. Two routes behind a shared bearer token:
//   GET  /sync/:id  → the stored merged project (404 if this project is unknown)
//   POST /sync/:id  → merge the posted ProjectFile into the stored one, return merged
// plus GET /health for Railway's healthcheck. Real per-user auth swaps in later; the
// `owner` column is already there for it.

import express, { type NextFunction, type Request, type Response } from 'express';
import {
  deleteProjectRow,
  getProject,
  getVersion,
  initSchema,
  listProjects,
  syncProject,
} from './db';
import type { ProjectFile } from '../../src/model/types';

const app = express();
app.use(express.json({ limit: '16mb' }));

// CORS: the desktop/web app runs on a different origin (app:// or localhost), so its
// fetch is cross-origin and sends a preflight (the Authorization header triggers it).
// The bearer token is the real gate, so allowing any origin is fine here.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'authorization, content-type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204); // preflight — no auth, no body
    return;
  }
  next();
});

const TOKEN = process.env.SYNC_TOKEN;

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Everything past here requires the shared token.
app.use((req: Request, res: Response, next: NextFunction) => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!TOKEN || token !== TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

app.get('/projects', async (_req: Request, res: Response) => {
  try {
    res.json(await listProjects());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Lightweight change-poll: clients fetch this cheap value and only do a full sync
// when it advances past the version they last saw.
app.get('/sync/:id/version', async (req: Request, res: Response) => {
  try {
    res.json({ version: await getVersion(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/sync/:id', async (req: Request, res: Response) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Remove a project from the server (the app's "Delete everywhere"). Note: a device
// that still has the project will re-upload it on its next push — deleting there
// too (or first) is what makes it stay gone.
app.delete('/sync/:id', async (req: Request, res: Response) => {
  try {
    const existed = await deleteProjectRow(req.params.id);
    res.status(existed ? 200 : 404).json({ ok: existed });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/sync/:id', async (req: Request, res: Response) => {
  try {
    const client = req.body as ProjectFile;
    if (!client || typeof client !== 'object' || !client.root || !Array.isArray(client.root.children)) {
      res.status(400).json({ error: 'body is not a project' });
      return;
    }
    if (client.id !== req.params.id) {
      res.status(400).json({ error: 'project id mismatch' });
      return;
    }
    res.json(await syncProject(req.params.id, client));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.PORT) || 8080;
initSchema()
  .then(() => app.listen(port, () => console.log(`[sync] listening on :${port}`)))
  .catch((err) => {
    console.error('[sync] failed to initialise schema:', err);
    process.exit(1);
  });
