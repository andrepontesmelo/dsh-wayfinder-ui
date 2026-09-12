# Issue tracker: dex

Tickets for this repo live in [dex](https://github.com/zeeg/dex) — a local CLI tracker whose store sits in `.dex/` at the repo root. One effort is a parent task; its tickets are subtasks; ordering between them is expressed with blocked-by edges. There are no per-ticket markdown files anywhere in the tree; the old `.scratch/` convention this file used to describe was deleted.

## Conventions

- One effort per parent task: `dex create "<effort name>" --description "..."`
- Tickets are children of the effort's parent task: `dex create "<ticket>" --description "..." --parent <effort-id>`
- The description IS the ticket body: question, requirements, approach, acceptance criteria. Revise it in place with `dex edit <id> --description` instead of appending comment threads.
- Open a ticket body with a `Type:` line (`research` / `prototype` / `grilling` / `task`) so the type survives outside any map registry.
- IDs are short opaque strings (`3arf5vre`). Reference a ticket as `dex task <id>`; the canonical locator format is `dex task <id> (dex show <id> --full)`.

## When a skill says "publish to the issue tracker"

Create dex tasks — never markdown files:

```bash
# new effort: create its parent task first
dex create "Spawn inheritance" --description "$(printf 'Type: task\nDestination ...\n')"

# then its tickets
dex create "Remove plugin config" --description "$(printf 'Type: task\n## Question\n...')" --parent i6outo36

# ordering, at create time or later
dex create "Implement route inheritance" --blocked-by bhlmfqln,3lugv043 --parent i6outo36
dex edit mgav92qx --add-blocker bhlmfqln
```

Charting from an existing markdown plan? The `dex-plan` skill converts it into dex tasks.

## When a skill says "fetch the relevant ticket"

```bash
dex show <id> --full          # the ticket itself
dex show <parent-id> --full   # epic/map context
dex show <blocker-id> --full  # what a blocker accomplished
```

## Wayfinding operations

Used by `/wayfinder`. The wayfinder **map**/**ticket** pair maps onto dex parent/child tasks.

- **Map**: the effort's parent task. Its description carries the Destination / Notes / Decisions-so-far / Out-of-scope sections.
- **Ticket**: one child task per ticket (`--parent`), question in the body, `Type:` line up top.
- **Blocking**: `--blocked-by <ids>` at create, or `dex edit <id> --add-blocker <id>` / `--remove-blocker <id>` later. A ticket is unblocked when every one of its blockers is completed.
- **Frontier**: `dex list --ready` — pending tasks with no incomplete blockers (`dex list --blocked` shows the complement).
- **Claim**: dex has no claim state; claiming is starting the work. Spawned worker sessions get their claim stamped as `spawnedSessionId` on the registry row in `.wayfinder-runner/state.json` by `wayfinder_spawn_session`; ad-hoc work simply does the ticket immediately.
- **Resolve**: `dex complete <id> --result "<outcome + verification evidence>"` — the result field replaces the old `## Answer` heading; pass `--commit <sha>` when the resolve ships code. Then fold the outcome into the parent's description with `dex edit <parent-id> --description ...` as a Decisions-so-far entry.

## Research findings

Research-ticket findings live at `docs/research/<slug>.md` and are linked from the completing task's `--result`. (The wayfinder default of throwaway `research/<name>` branches is deliberately deviated from here: this repo has a single working tree and research agents run concurrently, so isolation is per-file rather than per-branch.)
