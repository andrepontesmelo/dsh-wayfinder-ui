# dsh-wayfinder-ui — Context

Canonical vocabulary of dsh-wayfinder-ui — the lean plugin that spawns one DeepSeek chat session per ready wayfinder task and draws the map in a chat-page panel. This glossary fixes the domain words.

## The map

**Wayfinder map**:
The shared plan a wayfinder session charts: the tasks of one effort and their dependencies.
_Avoid_: board, project, queue

**Task**:
One unit of work on the map: a file (MD) or a record in the task system.
_Avoid_: card, ticket, job

**Task system**:
Where tasks live and where done/blocked is recorded: MD files, Jira, dex.
_Avoid_: tracker, backend, store

**Task locator**:
Where a task actually lives, stored on each registry row: a tracker-specific address (dex id, issue key, file path). Data, not code — the runner never parses the tracker itself.
_Avoid_: URL, deep link

**Dependency edge**:
A `Blocked by` link between tasks: the dependent task waits for the other to be done.
_Avoid_: prerequisite, parent

**Task type**:
The kind of work a task is, from its `Type:` line or `wayfinder:<type>` label: `research`, `prototype`, `grilling`, `task`. Drives the icon shown on the map box.
_Avoid_: category, class, label

**Type icon**:
The small glyph in each map box naming the task type: magnifier = research, pencil = prototype, speech bubble = grilling, neutral square = task/unknown. (The flame is not a type icon — it marks a live grilling batch.)
_Avoid_: emoji, badge (a badge is the join/dependency count pill)

**Grilling batch**:
One grilling session's stretch of grilling while it awaits the user. The session reports it by calling `wayfinder_grilling_start`, which stamps `grillingSince` on the row; each live batch lights one flame in the rail and card. Resolve (`wayfinder_task_resolve`) clears the stamp — resolve is the flame-off path.
_Avoid_: grilling round, grilling session (the session is the worker; the batch is its awaiting-input stretch)

**Open map**:
A wayfinder map still being charted — at least one task not yet `Status: resolved`. The only maps the runner ever shows or spawns against.
_Avoid_: in-progress effort, active project

**Closed map**:
A wayfinder map whose every task is `Status: resolved` (its route is clear). Never shown in the map view and never a spawn target.
_Avoid_: done map, finished effort

**Registry**:
The per-workspace state file `.wayfinder-runner/state.json` listing every wayfinder map created in that workspace with its tasks, statuses, and spawn associations. The plugin's single source of truth; committed to git. Which map the runner operates on is its `selectedMapId`.
_Avoid_: cache, session state

## The sessions

**Session**:
One chat conversation in the DeepSeek UI, spawned by the plugin for one task. The human can open and continue it.
_Avoid_: worker, subagent, attempt

**Spawn**:
The plugin verb that starts one top-level session per ready task, in parallel, each seeded with "load wayfinder skill, work on task (TASK_ID)".
_Avoid_: dispatch, launch, fan-out

**Route inheritance**:
A spawned session defaults to the spawning session's provider/model unless overridden on its wayfinder_spawn_session call. There is no plugin-level default route.
_Avoid_: model config, parent-of record

**Grilling task**:
A task that needs human alignment. Its session halts with a question; the human answers in-session.
_Avoid_: interactive task; review is one kind of grilling task

**Halt**:
A session's turn ends with a question and waits for the human. Not a failure, not a state the plugin records.
_Avoid_: block, pause, park

**Worker report**:
A spawned session's `wayfinder_task_resolve` call marking its task done in the registry. The only automatic writer of done besides manual override.
_Avoid_: completion callback

**Awaiting input**:
A live session state the plugin derives: the agent is idle and the agent spoke last. Shown on the map row as "waits for you".
_Avoid_: blocked, stuck

## The plugin

**Map view**:
The embedded, collapsible drawer docked to the right edge of the chat page: one box per task (done / running / waits-for-you / blocked), drawn as a true dependency tree — dependents nested under and to the right of their blocker, connected by visible elbow rails, join nodes rendered once with a "N blockers" pill, per-node subtree collapse, and pressable session links. Type icons identify research / prototype / grilling / task boxes.
_Avoid_: dashboard, board UI, kanban

**Snippet**:
The plugin-shipped instructions that teach the wayfinder root session to propose spawns and wait for the human's approval. Printed by the `snippet` verb.
_Avoid_: prompt addition, skill patch

**Frontier**:
The open, unblocked decisions of a wayfinder map — the questions askable now.
_Avoid_: backlog, queue
