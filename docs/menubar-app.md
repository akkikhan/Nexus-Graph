# Menu Bar App MVP

The `@nexus/menubar-app` package provides a menu bar-ready core and Electron tray shell for Phase 6 MVP:

- Inbox summary model (`open`, `draft`, `merged`, `closed`, high/critical risk)
- Pull request quick actions:
  - Open in dashboard
  - Request AI review
  - Mark draft/open/closed
  - Merge
- Electron tray entrypoint (`src/electronMain.ts`) with:
  - periodic inbox refresh
  - dynamic tray menu generation
  - quick-action execution with refresh-on-action

## Development

```bash
pnpm --filter @nexus/menubar-app build
pnpm --filter @nexus/menubar-app test
pnpm --filter @nexus/menubar-app start:electron
```

## Packaging and Distribution

Create unpacked app output for local verification:

```bash
pnpm --filter @nexus/menubar-app package:electron:dir
```

Create distributable zip artifacts (CI/release):

```bash
pnpm --filter @nexus/menubar-app package:electron:ci
```

Artifacts are written to `output/menubar/`.
CI workflow `Validation` uploads these artifacts from the `menubar-package` job.

## Electron Environment

- `NEXUS_API_BASE_URL` (default `http://localhost:3001`)
- `NEXUS_WEB_BASE_URL` (default `http://localhost:3000`)
- `NEXUS_INBOX_LIMIT` (default `20`)
- `NEXUS_TRAY_REFRESH_MS` (default `60000`)
- `NEXUS_TRAY_ICON` (optional absolute icon path)

## Example Integration Sketch

```ts
import { NexusMenuBarApp, createNexusClient } from "@nexus/menubar-app";

const client = createNexusClient({
  apiBaseUrl: "http://localhost:3001",
  requestTimeoutMs: 8000,
});

const app = new NexusMenuBarApp(client, {
  openExternal: async (url) => {
    // Desktop shell specific open call
  },
}, {
  webBaseUrl: "http://localhost:3000",
});

const menu = await app.refresh(20);
// Render `menu` in your tray UI.
```
