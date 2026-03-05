# Nexus VS Code Extension

Nexus in-editor workflow for pull request inbox and quick actions.

## Features

- Nexus inbox view in Explorer
- Pull request quick actions
- Request AI review from VS Code
- Open PR in Nexus dashboard

## Development

```bash
pnpm build
pnpm test
pnpm manifest:check
pnpm package:vsix
```

The packaged artifact is emitted to `../../output/vscode-extension/`.
