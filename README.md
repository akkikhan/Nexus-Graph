# NEXUS - Code Review, Reimagined

> **Next-generation AI-powered code review platform with stacked PRs**

![NEXUS Banner](./docs/banner.png)

## 🚀 Features

- **🔀 Stacked Pull Requests** - Break large changes into small, reviewable pieces
- **🤖 Multi-LLM AI Reviews** - Claude, GPT-4, Gemini - choose your model
- **🎯 Auto-Split PRs** - AI suggests how to break up large PRs
- **📊 Risk Scoring** - Know which PRs need extra attention
- **🔄 Merge Queue** - Stack-aware, conflict-free merging
- **🖥️ Visual Stack Editor** - Drag-drop PR management
- **🌐 Multi-Platform** - GitHub, GitLab, Bitbucket, Azure DevOps
- **🏠 Self-Hosted** - Full Docker deployment option

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@nexus/cli` | Command-line interface |
| `@nexus/web` | Web dashboard (Next.js) |
| `@nexus/api` | API server |
| `@nexus/menubar-app` | Menu bar inbox summary and quick PR actions MVP |
| `@nexus/vscode-extension` | VS Code inbox and PR actions MVP |
| `@nexus/core` | Shared business logic |
| `@nexus/ai` | AI engine with multi-LLM support |
| `@nexus/git` | Git operations |
| `@nexus/db` | Database schema |
| `@nexus/ui` | Shared UI components |

## 🛠️ Quick Start

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Run VS Code extension tests
pnpm --filter @nexus/vscode-extension test

# Run menu bar app tests
pnpm --filter @nexus/menubar-app test
```

## 🖥️ CLI Usage

```bash
# Install CLI globally
npm install -g @nexus/cli

# Authenticate
nx auth

# Create a new branch in your stack
nx create feature-name

# Submit PRs for your stack
nx submit

# View your stack
nx log

# AI review locally
nx review
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      NEXUS Platform                      │
├──────────┬──────────┬──────────┬──────────┬────────────┤
│   CLI    │   Web    │   API    │    AI    │ Merge Queue│
├──────────┴──────────┴──────────┴──────────┴────────────┤
│                    Core Library                         │
├─────────────────────────────────────────────────────────┤
│     PostgreSQL      │      Redis      │    GitHub API   │
└─────────────────────────────────────────────────────────┘
```

## 📄 License

MIT © NEXUS Team

## Validation

Run end-to-end smoke checks locally:

```bash
pnpm validate:release
```

Run individual suites:

```bash
pnpm validate:artifacts
pnpm smoke:api
pnpm smoke:web
```

Detailed guide: `docs/validation.md`

Menu bar app guide: `docs/menubar-app.md`

VS Code extension guide: `docs/vscode-extension.md`

## Database Environments

DB setup now supports local Postgres, Supabase, and Azure Postgres.

```bash
pnpm db:env:preflight
pnpm db:bootstrap:supabase
pnpm db:bootstrap:azure
```

Full environment guide: `docs/database-environments.md`

## Production Sign-off

Pre-prod checks:

```bash
pnpm ops:preflight
ALLOW_DEGRADED=false pnpm smoke:api
ALLOW_DEGRADED=false REQUIRE_PLAYWRIGHT=true pnpm validate:release
```

Deployment and rollback (Oracle VM):

```bash
# Linux/macOS
VM_IP=<vm-ip> VM_USER=ubuntu SSH_KEY=~/.ssh/oci_ed25519 ./deploy/deploy.sh
VM_IP=<vm-ip> VM_USER=ubuntu SSH_KEY=~/.ssh/oci_ed25519 ./deploy/rollback.sh

# Windows PowerShell
powershell -File .\deploy\deploy.ps1 -VmIp <vm-ip>
powershell -File .\deploy\rollback.ps1 -VmIp <vm-ip>
```
