# Beginner Guide

This guide explains Nexus as if you are opening it for the first time.

The current local app opens directly into the dashboard. There is no separate onboarding or sign-in journey in this build, so your first experience starts with the sidebar.

## What Nexus Does

Nexus is a dashboard for code review operations. It helps you:

- review pull requests
- group related pull requests into stacks
- manage merge queue state
- monitor activity and insights
- configure AI review behavior
- operate integrations and alerts

## Best First-Time Route

Use the app in this order:

1. `Inbox`
2. `Open one PR`
3. `Stacks`
4. `Open one stack`
5. `Queue`
6. `Activity`
7. `Insights`
8. `AI Rules`
9. `Settings`

This sequence matters. `Inbox`, `PR detail`, `Stacks`, and `Queue` are the primary product flow. `Activity`, `Insights`, `AI Rules`, and `Settings` are supporting and operator-facing views.

## Sidebar Map

- `/inbox`: review worklist
- `/stacks`: stacked pull request management
- `/queue`: merge queue control plane
- `/activity`: event timeline
- `/insights`: AI and delivery insights
- `/ai-rules`: dedicated AI review controls
- `/settings`: app, integration, alert, and recovery settings

## Beginner Flow

## Inbox

URL: `http://localhost:3000/inbox`

What it is:

- the list of pull requests that need attention

What you can do:

- search pull requests
- filter by status
- inspect risk level
- open a pull request

What you should notice:

- PR title
- repository name
- author
- status
- risk bar/color

Beginner steps:

1. Open `Inbox`.
2. Look at the summary cards.
3. Try search with a keyword.
4. Try the `open`, `merged`, or `draft` filters.
5. Click one PR card.

## PR Detail

URL pattern: `http://localhost:3000/inbox/<pr-id>`

What it is:

- the detailed screen for one pull request

What you can do:

- request AI review
- merge the PR
- inspect linked issues
- inspect changed files

Beginner steps:

1. Read the title and summary.
2. Look at the risk score.
3. Check branch direction, for example `feature -> main`.
4. Review linked issues if present.
5. Review changed files.
6. Click `Request AI Review`.

Notes:

- `Merge PR` is a real action and changes state. Do not use it casually in a shared environment.
- If a PR is already merged, the button state reflects that.

## Stacks

URL: `http://localhost:3000/stacks`

What it is:

- a place to manage related PR branches as a stack

What you can do:

- view stack cards
- create a new stack

Beginner steps:

1. Open `Stacks`.
2. Click `New Stack`.
3. Enter a stack name.
4. Leave repository blank if you are just exploring.
5. Leave base branch as `main`.
6. Click `Create Stack`.

Notes:

- The stack name is required.
- If repository is omitted, the app uses the first available repo.

## Stack Detail

URL pattern: `http://localhost:3000/stacks/<stack-id>`

What it is:

- the detail screen for a stack

What you can do:

- inspect branch order
- see stack PR counts
- sync the stack
- submit the stack

Beginner steps:

1. Open a stack from the list.
2. Look at `Base`, `mergeable`, and `PRs`.
3. Review the branch order section.
4. Click `Sync Stack`.
5. Click `Submit Stack`.

Notes:

- Some branches can exist without a linked PR yet.
- Stack actions are real state-changing operations.

## Queue

URL: `http://localhost:3000/queue`

What it is:

- the merge queue dashboard

What you can do:

- pause the queue
- resume the queue
- enable or disable turbo mode
- retry or remove queue items

Beginner steps:

1. Open `Queue`.
2. Read the summary cards first.
3. Identify whether the queue is paused.
4. Observe the active queue entries.
5. Try `Pause Queue` and `Resume Queue` only if you understand the impact.
6. Toggle turbo mode to see the state change.

Notes:

- This is operational, not just informational.
- Retry/remove actions affect queue entries directly.

## Activity

URL: `http://localhost:3000/activity`

What it is:

- the timeline of recent events across the app

What you can do:

- switch filters
- review recent events
- load more

Beginner steps:

1. Open `Activity`.
2. Switch between filters.
3. Read the event feed as history, not as a task list.

## Insights

URL: `http://localhost:3000/insights`

What it is:

- the analytics and AI insight dashboard

What you can do:

- inspect bottlenecks
- inspect review health and throughput patterns
- read AI-generated operational guidance

Beginner steps:

1. Open `Insights`.
2. Treat it as a read-only understanding page.
3. Use it to understand patterns, not to replace manual judgment.

## AI Rules

URL: `http://localhost:3000/ai-rules`

What it is:

- the dedicated page for AI review behavior

What you can do:

- choose provider
- choose model
- enable or disable auto-review
- enable or disable ensemble mode
- change risk threshold
- save or reset

Beginner steps:

1. Open `AI Rules`.
2. Change one value only, for example provider or threshold.
3. Click `Save AI Rules`.
4. Reload and confirm the value persisted.

## Settings

URL: `http://localhost:3000/settings`

What it is:

- the admin and operations control center

What you can do:

- save app settings
- inspect system health
- inspect integrations
- triage alerts
- retry failed delivery and webhook work
- review audits

Beginner steps:

1. Open `Settings`.
2. Start by reading, not changing.
3. Check health status first.
4. Check AI, merge queue, and notification sections.
5. Avoid alert and retry controls until you understand them.

## Safe First Actions

- search in `Inbox`
- open a PR
- request AI review
- create a stack
- open a stack
- read queue status
- save one AI Rules change

## Risky First Actions

- merging PRs
- removing queue items
- disabling integration connections
- muting alerts in bulk
- retrying recovery queues without understanding the failure cause
- escalating incidents

## Practical Summary

Use Nexus like this:

1. Find work in `Inbox`.
2. Open a PR and inspect it.
3. Request AI review if needed.
4. Use `Stacks` for grouped changes.
5. Use `Queue` for merge operations.
6. Use `Activity` and `Insights` for visibility.
7. Use `AI Rules` and `Settings` only when you need to change system behavior.
