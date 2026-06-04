# Example projects

- **`sprint-demo.json`** — a realistic 2-week sprint ("Sprint 24") with one epic and
  10 tasks (plus a note). It has full `statusHistory`, varied cycle times, scope that
  grows across the window, an in-progress task, a not-started task, and a reopened bug —
  enough to exercise the upcoming charts (burnup, cycle/lead-time, classic burndown).

Open it in the app via **Open File**, or drop it into a folder you open as a workspace.

Regenerate it with:

```bash
node scripts/gen-demo.mjs
```

The generator (`scripts/gen-demo.mjs`) uses fixed dates so the output is deterministic;
`src/model/demo.test.ts` asserts the derived metrics stay correct.
