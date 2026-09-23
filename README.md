# dsh-wayfinder-ui

[![CI](https://github.com/andrepontesmelo/dsh-wayfinder-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/andrepontesmelo/dsh-wayfinder-ui/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/package-json/v/andrepontesmelo/dsh-wayfinder-ui/main?label=version)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](#prerequisites)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-blue.svg)](https://github.com/andrepontesmelo/dsh-wayfinder-ui)
![local gate](https://img.shields.io/badge/local%20gate-106%20tests-brightgreen)

A tracker-agnostic [Wayfinder](https://github.com/deepseek-ai/dsh) runner plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/dsh): every new session learns a three-verb registration contract, maps live in a per-workspace registry file at `.wayfinder-runner/state.json` (committed), and the UI polls `/dsh-wayfinder/state.json`.

## When to reach for it

You chart Wayfinder maps for DSH work and want every ready task picked up by its own top-level session while the dependency map tracks progress live — regardless of where the tasks are tracked (dex, Jira, GitHub issues, markdown files).

## Prerequisites

- **Node.js ≥22** (see `engines` in `package.json`)
- DSH with the **web profile** (`~/.dsh/profiles/web/`)
- `pnpm` or `npm` for local development

## Install

```sh
# 1. Clone anywhere
git clone https://github.com/andrepontesmelo/dsh-wayfinder-ui.git
# 2. Symlink into the web profile
ln -s /path/to/dsh-wayfinder-ui ~/.dsh/profiles/web/node_modules/dsh-wayfinder-ui
```

Append the plugin row to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: wayfinder
      name: 'dsh-wayfinder-ui'
```

Spawned sessions inherit the spawning session's route (`provider`/`model`); optional `provider`/`model` arguments on `wayfinder_spawn_session` override that inheritance per call.

They join the spawning session's workspace as well; when the caller is Ungrouped — or the wayfinder root lies outside the caller's own workspace directory, which upstream attach validation rejects — the spawned session stays Ungrouped instead of being forcibly regrouped.

Restart the GUI. The model tools and the map panel both load on startup.

> **npm:** `npm install dsh-wayfinder-ui` is planned after manual validation — GitHub is the install source until then.

## It's working if

- A fresh session receives the three-verb contract on startup, and Settings → Wayfinder lists the toggles.
- `wayfinder_map_create` writes `.wayfinder-runner/state.json` and the right rail renders your map's task rows.
- An approved spawn opens one top-level session per ready task, and a worker's `wayfinder_task_resolve` flips its row to done.

## Tools

All seven are model-callable once the plugin is installed.

- **wayfinder_snippet** — prints the protocol: propose ready wayfinder tasks to the human, ask for explicit approval, then call `wayfinder_spawn_session` exactly once. Never spawn without approval. It also documents the seed-message format and the route-inheritance rule.
- **wayfinder_spawn_session** — spawns one top-level DSH session per ready task, in parallel. Tasks come from the registry frontier: omit `tasks` to spawn every ready task (derived status `todo`; done and blocked-by-undone rows are skipped). Each seed carries a *Task locator* line pointing at where the task's work lives, so workers find their real tickets wherever they are tracked — dex, Jira, GitHub issues, markdown files. Each spawned session joins the spawning session's workspace and inherits its route; pass optional `provider`/`model` to override per call.
- **wayfinder_map_create** — charts a new map into the registry: validates `tasks: [{id, title, type?, locator, blockedBy?}]`, persists it at `<root>/.wayfinder-runner/state.json`, and makes it the selected open map.
- **wayfinder_task_resolve** — marks one task done because a worker finished it (the worker-report path), stamping the reporting session onto the row.
- **wayfinder_task_set_status** — manual override of one task's status (`todo|done|running|waiting|blocked`). Prefer `wayfinder_task_resolve` for worker completion reports.
- **wayfinder_map_sync** — create-or-replace a map by name with a complete task list; also registered as the `/wayfinder-map-sync` recovery hatch.
- **wayfinder_grilling_start** — report that a grilling task's session has begun grilling a batch and awaits the user. Stamps `grillingSince` on the row, which lights a flame in the panels (right rail + in-session card); `wayfinder_task_resolve` clears it. Grilling-typed spawns carry the instruction in their seed.

## How it works

1. **Chart** — `wayfinder_map_create` validates the task list and persists the map as the selected open map of the workspace registry.
2. **Spawn** — each approved task gets a top-level DSH session seeded with `/wayfinder work on task (TASK_ID) of map (MAP_NAME)` (the leading `/wayfinder` gesture makes the harness inject the skill content, exactly as if the human typed the slash command) plus its *Task locator* line.
3. **Report** — workers finish by calling `wayfinder_task_resolve`, which marks their task done and links the reporting session.
4. **Derive** — `done` comes from reports/manual overrides, `blocked` from `blockedBy` edges, and `running`/`waiting` are computed live from the spawned sessions (running agent; idle agent whose newest model-visible event is an assistant message).
5. **Restart** — the plugin reloads the state file: `selectedMapId` wins (falling back to the newest open map), and sessions re-associate with their rows by matching the seeded message.

## Surfaces

- **In-session card** — the collapsible To-dos-style card above the composer renders only in the session that charted the map: the payload carries `createdBySessionId`, and the dock compares it against its own session. A map without a stamped owner (hand-written registry) shows no card anywhere; call `wayfinder_map_sync` once from your session to claim it.
- **Right rail** and **ambient sidebar badges** stay workspace-wide on purpose: mission control should be visible from every session. Both remain individually togglable in Settings → Wayfinder.
- **Session links** — task rows on the rail (and on an expanded card) carry an ↗ link when a session is spawned for that row; clicking opens that session, exactly like clicking its sidebar row.
- **Grilling flames** — one 🔥 per live grilling batch: a grilling-typed session calls `wayfinder_grilling_start` when it starts grilling and waits for you; the rail and card show a flame pill (`N grilling`) plus a per-row flame until the task resolves.

## Development

```sh
pnpm install
npm test        # node --test
```

## Known limitations

- Web profile only: the card, right rail, and sidebar badges live in the DSH GUI.
- Spawns target the registry's selected open map (`selectedMapId`, falling back to the newest open map).

## License

[MIT](LICENSE) © 2026 Andre Melo
