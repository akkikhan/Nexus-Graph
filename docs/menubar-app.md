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
