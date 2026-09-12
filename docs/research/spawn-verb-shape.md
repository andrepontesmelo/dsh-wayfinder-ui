# Spawn verb + parallel spawn + per-task routing (ticket 03)

**Verdict: the archived Mechanism 1 pattern, verified unchanged at rc.8, wrapped as a single parallel spawn verb.** Each task spawns a top-level DSH session via `ctx.agents.create` with a caller-minted id, per-task `cwd`, and per-task route; the verb seeds the deterministic message and runs all spawns concurrently with `Promise.allSettled` (per-task failure isolation, no fatal failure). Per-task routing lives in wayfinder's own task-file front matter (`provider:`/`model:`), falling back to a plugin-config default route — no persona files, no plugin-owned state.

## Findings (rc.8 verification)

1. **Reference pattern, re-verified at rc.8** — `dsh-headless/lib/index.js:63-99`:
   - `const { agent } = await agents.create({ sessionId: SessionId("session-<uuid>"), meta: { cwd }, agentOptions: { provider, model }, setup })` (`:70-83`)
   - `await agent.whenIdle()` — initial idle settle (`:84`)
   - `agent.followup(createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } }))` (`:86-92`)
   - `await agent.whenIdle()` (`:93`)
   - `await sessions.flush(agent.session)` — durability gate (`:94`)
   - Outcome is data: `summarize(agent.session.events, firstSeq)` with `reason.kind` (`:95-98`); `whenIdle()` never rejects on turn errors (archived finding, `worker-session-spawning.md` — the `turn/end` reason carries failure: `completed | aborted | blocked | error | max-tokens | interrupted`).
   - Top-level creation (`meta` without `parentSession`) ⇒ session is GUI-visible/openable — see `docs/research/gui-session-attachability.md` (conditions: top-level, `meta.cwd` set, `flush()`).

2. **Command surface** — `@deepseek-ai/dsh-cmdline` hands the launcher's argument snapshot to the app's commander program via `parseCmdline(ctx, program)` (`dsh-cmdline/lib/index.js:37-58`). The plugin composes its verbs there; the archived M1 plan used the same seam for `validate`/`status`/`run`. The verb is invokable from a shell and therefore from the root session's bash tool — the approval gate stays with the human.

3. **Command sketch**
   ```
   dsh kanban spawn [--cwd <dir>] [--max-concurrent <n>] [--provider <p>] [--model <m>] --task 03,05,09
   ```
   - Per task: resolve route (task front matter `provider`/`model` → verb flags → plugin config default), mint `sessionId` (`session-<uuid>`), `meta: { cwd }`, `agentOptions: { provider, model }`.
   - Seed message: `"load wayfinder skill, work on task (<TASK_ID>)"` (TASK_ID = the task's id in its wayfinder map).
   - Parallel loop: `Promise.allSettled(spawns)` with a simple concurrency cap when `--max-concurrent` is set (default: all at once).
   - Per-task report: `spawned | failed(<reason>)` per task id + session id on success; no failure is fatal — the verb reports and continues; worst case is a full failure report.
   - After every `whenIdle()`-settled turn: `sessions.flush(agent.session)` so spawned sessions cold-list and survive restarts.
   - The verb does NOT track completion: per the map's settled decisions, the human owns state; the map view derives waiting/done from task files + host session state.

4. **Routing input format (recommendation)** — wayfinder task-file front matter:
   ```yaml
   provider: opencode-go
   model: deepseek-v4-flash
   ```
   Justification: wayfinder already owns the task files and is backend-agnostic (Jira fields map the same); DSH presets cannot carry the route (host owns provider/model — archived persona finding, ticket 06 of the prior map); persona YAML files would be a new plugin-owned artifact, which the redesign explicitly avoids. Verb flags override per-run; plugin config supplies the default route.

5. **Rejected alternatives** — subprocess one-shot CLI per task (loses session-id control + structured outcomes; archived Mechanism 2); config-driven `agents: []` rows (startup-shaped, wrong for dynamic spawns; archived Mechanism 3); `ctx.subagents` seam (parent-scoped, and subagent-owned sessions are exactly what the GUI refuses to open — `docs/research/gui-session-attachability.md` finding 4).

## Bottom line

One deterministic verb, one `ctx.agents.create` per ready task, parallel with per-task isolation, routing from wayfinder's own task files. Nothing else built.
