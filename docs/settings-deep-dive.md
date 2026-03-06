# Settings Deep Dive

This document explains the `Settings` page in plain language.

URL: `http://localhost:3000/settings`

The page is an operator control center. It mixes configuration, health, integrations, alerts, retry queues, and audits in one place.

## How To Read This Page

Do not treat the whole page as one form.

Instead, think of it as a set of control panels:

1. app behavior
2. health and state visibility
3. integrations
4. recovery queues
5. alert triage
6. incident escalation
7. audits

If you are new, start at the top and read before changing anything.

## AI Configuration

What it controls:

- AI provider
- AI model
- auto-review
- ensemble mode
- risk threshold

Why it exists:

- controls how Nexus AI behaves when reviewing pull requests

What changing it means:

- provider/model: changes which AI engine is preferred
- auto-review: decides whether new PRs get reviewed automatically
- ensemble mode: uses multiple model opinions for higher-confidence results
- risk threshold: controls when risk is treated as important enough to flag

When a beginner should change it:

- when testing AI behavior deliberately

When not to change it:

- if you do not know how the team expects reviews to run

## Merge Queue

What it controls:

- merge queue enabled
- require CI
- auto rebase
- merge method

Why it exists:

- defines the rules for how PRs move toward merge

What the options mean:

- enable merge queue: use the queue instead of ad hoc merge
- require CI: PR must pass CI before merge
- auto rebase: try to rebase when branch drift happens
- merge method: choose merge commit, squash, or rebase

Why this matters:

- these choices affect safety, history shape, and merge consistency

## Notifications

What it controls:

- email review notifications
- email AI findings
- Slack notifications
- desktop notifications

Why it exists:

- determines how people hear about work and failures

Simple interpretation:

- email reviews: notify when review attention is needed
- email AI findings: notify for important AI results
- Slack: send alerts/messages into Slack
- desktop notifications: browser-level local prompts

## Integrations

What it shows:

- external providers and whether they are connected

Typical providers:

- GitHub
- GitLab
- Slack
- Jira
- Linear

Why it exists:

- Nexus is more useful when linked to existing tools

What the status values mean:

- connected: ready to use
- disconnected: not active
- coming soon: visible in product shape, not available for real use yet

## System Health

What it shows:

- whether backend dependencies are healthy
- whether the database is connected

Why it exists:

- helps separate product problems from infrastructure problems

How to use it:

- if the app feels broken, check health first before blaming a page or button

## Integration Snapshot And Metrics

What it shows:

- connection counts
- retry queue counts
- provider distribution
- webhook and auth failure patterns

Why it exists:

- gives a quick operational summary without reading every event

How to interpret it:

- rising retry queues usually mean delivery or processing problems
- auth failure spikes often mean bad tokens, bad signatures, or config drift

## Alert Triage

What it controls:

- acknowledge alert
- mute alert
- unmute alert
- bulk alert actions

Why it exists:

- active systems generate repeated alerts; triage prevents noise from becoming chaos

Plain-language meaning:

- acknowledge: "someone has seen this"
- mute: "stop surfacing this temporarily"
- unmute: "resume surfacing this"

What a beginner should know:

- acknowledging does not fix the problem
- muting reduces noise but can hide real issues
- bulk actions are stronger and easier to misuse

## Incident Escalation

What it controls:

- escalation target and escalation scope

Why it exists:

- some alert conditions are important enough to push to a higher-severity workflow

What it means in plain language:

- this is the "make more people care now" control

When to use it:

- repeated failures
- SLA breach conditions
- active alert clusters that need immediate attention

## Connection Control Plane

What it controls:

- validate connection
- fail validation intentionally
- enable connection
- disable connection

Why it exists:

- lets operators test and manage an integration without recreating it

What each action means:

- validate: run a success-path validation
- fail validate: intentionally test failure behavior
- enable: allow this connection to be used
- disable: keep the connection present but inactive

Important note:

- this is real operational state, not a demo toggle

## Connection Action Audits

What it shows:

- history of connection operations

Why it exists:

- operators need to know who changed what and when

Useful questions it answers:

- who disabled Slack
- who revalidated Jira
- when a connection changed status

## Webhook Recovery Queue

What it is:

- a list of webhook events that need retry or recovery attention

Why it exists:

- inbound provider events can fail due to transient issues

What `Retry Due` means:

- retry items that are eligible for another processing attempt now

Beginner guidance:

- do not spam retry without understanding the root cause

## Notification Delivery Queue

What it is:

- outgoing notifications waiting, retrying, failing, or dead-lettered

Why it exists:

- outbound messages can fail independently of the rest of the app

What to look for:

- many failed or dead-letter items
- repeated retries that do not recover

## Issue-Link Sync Queue

What it is:

- issue linkage work that could not sync cleanly

Why it exists:

- PR to Jira/Linear linking can fail due to provider or auth issues

What to do:

- inspect failures
- retry when the external cause is fixed

## Webhook Auth Events

What it is:

- a log of rejected or problematic webhook authentication attempts

Why it exists:

- helps diagnose signature problems, timestamps, and misconfiguration

What to look for:

- repeated signature failures
- repeated stale timestamp failures
- provider-specific auth drift

## Audits Everywhere

The Settings page includes multiple audit-style sections because it is an operator page.

These audits matter because they answer:

- what happened
- who triggered it
- when it happened
- whether the system recovered

## Safe Beginner Actions

- read health status
- inspect integration statuses
- change one AI or merge setting
- save changes once

## Risky Beginner Actions

- disable active connections
- bulk mute alerts
- retry all due work blindly
- escalate incidents without context

## Suggested Beginner Sequence For Settings

1. Open `Settings`.
2. Read the health section.
3. Read AI configuration.
4. Read merge queue settings.
5. Read notification settings.
6. Inspect integration statuses.
7. Stop there on your first visit.

On a second visit:

1. change one safe setting
2. click `Save Changes`
3. reload and confirm it persisted

On later visits:

- use triage, recovery, and escalation sections as operator tools

## Relationship To Other Pages

- `AI Rules` is a focused subset of AI-related settings
- `Queue` reflects merge queue behavior configured here
- `Inbox` and PR detail reflect review behavior influenced by AI settings
- `Activity` and audits help explain what changes were made here

## One-Line Summary

`Settings` is the operations room of Nexus: configuration, health, recovery, and alert handling all live here.
