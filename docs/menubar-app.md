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

Generate auto-update metadata manifest (SHA256 + size + channel rollout):

```bash
pnpm menubar:metadata
```

Release pipeline command (package + metadata generation):

```bash
pnpm menubar:release:ci
```

Metadata output:

- `output/menubar/updates/latest-<channel>.json`
- `output/menubar/updates/latest.json` (stable channel alias)

## Electron Environment

- `NEXUS_API_BASE_URL` (default `http://localhost:3001`)
- `NEXUS_WEB_BASE_URL` (default `http://localhost:3000`)
- `NEXUS_INBOX_LIMIT` (default `20`)
- `NEXUS_TRAY_REFRESH_MS` (default `60000`)
- `NEXUS_TRAY_ICON` (optional absolute icon path)
- `NEXUS_MENUBAR_RELEASE_CHANNEL` (`stable`, `beta`, `nightly`; default `stable`)
- `NEXUS_MENUBAR_UPDATE_MANIFEST_URL` (optional full manifest URL, overrides base URL)
- `NEXUS_MENUBAR_UPDATE_CHECK_MS` (default `3600000`, periodic update check interval)
- `NEXUS_MENUBAR_UPDATE_SNOOZE_HOURS` (default `24`, used by tray "Remind Me Later")
- `NEXUS_MENUBAR_ROLLOUT_KEY` (optional deterministic rollout identity override)
- `NEXUS_MENUBAR_UPDATE_PUBLIC_KEY` (optional Ed25519 PEM public key used to verify signed manifests)
- `NEXUS_MENUBAR_UPDATE_REQUIRE_SIGNATURE` (`true`/`false`; when true, unsigned or unverifiable manifests are rejected)
- `NEXUS_MENUBAR_UPDATE_DOWNLOAD_DIR` (optional override for where verified update artifacts are written)
- `NEXUS_MENUBAR_UPDATE_AUTH_TOKEN` (optional token sent when downloading update artifacts)
- `NEXUS_MENUBAR_UPDATE_AUTH_HEADER` (default `Authorization`)
- `NEXUS_MENUBAR_ROLLOUT_PERCENT` (default per channel: stable=`100`, beta=`40`, nightly=`10`)
- `NEXUS_MENUBAR_UPDATE_BASE_URL` (default `https://downloads.nexus.dev/menubar`)
- `NEXUS_MENUBAR_RELEASE_VERSION` (optional override; defaults to `apps/menubar-app/package.json` version)
- `NEXUS_MENUBAR_SIGNING_PRIVATE_KEY` (optional Ed25519 PEM private key for release metadata signing)
- `NEXUS_MENUBAR_SIGNING_KEY_ID` (optional key identifier stored in manifest signature block)
- `NEXUS_MENUBAR_REQUIRE_SIGNATURE` (`true`/`false`; fail metadata generation when signing key is missing)

## Auto-update UX

Tray menu now includes:

- Channel update status row (`checking`, `up to date`, `staged rollout`, `available`, or `check failed`)
- `Check for Updates` action for manual refresh
- `Download Update (...)` action when an eligible artifact is available for the current `platform/arch`
- `Cancel Download` while an artifact transfer is in progress
- `Install Downloaded Update` and `Reveal Downloaded File` after checksum verification succeeds
- `Retry Download` / `Re-download Update` controls for failed or already-downloaded artifacts
- `Remind Me Later` (snoozes update visibility for configured hours)
- `Skip This Version` (hides a specific version on this machine)

Rollout gating is deterministic per machine identity (`NEXUS_MENUBAR_ROLLOUT_KEY` or hostname/user fallback).
Local update preferences are persisted under Electron `userData` (`update-decision-state.json`).
Manifest integrity is enforced with strict `sha256` digest format checks and optional Ed25519 signature verification.
Downloaded artifacts are verified against manifest checksum and size before install/reveal actions are surfaced in the tray.

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
