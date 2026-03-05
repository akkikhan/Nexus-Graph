# VS Code Extension MVP

The `nexus-vscode-extension` package provides Phase 6 MVP parity for in-editor workflow:

- Inbox view (`Nexus Inbox`) in Explorer
- Inbox summary command
- Pull request actions (open in dashboard, request AI review, status updates, merge)

## Development

```bash
pnpm --filter nexus-vscode-extension build
pnpm --filter nexus-vscode-extension test
pnpm vscode:manifest:check
pnpm vscode:release:ci
```

Artifacts are written to `output/vscode-extension/`.

## Run in VS Code Extension Host

1. Open `apps/vscode-extension` in VS Code.
2. Run `pnpm install` at repository root (if not already installed).
3. Press `F5` to launch an Extension Development Host.
4. Use the Command Palette:
   - `Nexus: Refresh Inbox`
   - `Nexus: Show Inbox Summary`
   - `Nexus: Pull Request Actions`
   - `Nexus: Request AI Review`

## Configuration

Configure in VS Code settings:

- `nexus.apiBaseUrl` (default: `http://localhost:3001`)
- `nexus.webBaseUrl` (default: `http://localhost:3000`)
- `nexus.inboxLimit` (default: `20`)
- `nexus.requestTimeoutMs` (default: `8000`)
