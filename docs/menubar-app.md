# Menu Bar App MVP

The `@nexus/menubar-app` package provides a menu bar-ready core for Phase 6 MVP:

- Inbox summary model (`open`, `draft`, `merged`, `closed`, high/critical risk)
- Pull request quick actions:
  - Open in dashboard
  - Request AI review
  - Mark draft/open/closed
  - Merge

This package is intentionally runtime-agnostic. It does not bind directly to a specific tray framework yet. A desktop shell (Electron, Tauri, native) can integrate by wiring:

- `NexusMenuBarApp` as the application core
- a `MenuBarSystemAdapter` implementation for opening URLs
- a tray renderer that maps `MenuModel` to actual menu items

## Development

```bash
pnpm --filter @nexus/menubar-app build
pnpm --filter @nexus/menubar-app test
```

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

