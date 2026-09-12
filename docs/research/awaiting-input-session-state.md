# Awaiting-input detection from live session state (ticket 02)

**Verdict: DERIVABLE IN-PROCESS — no marker files needed.** The predicate is `agent.status === "idle"` AND the last model-visible event is an `assistant/message`. The live agent status comes from `ctx.agents.get(sessionId)?.status` (`'idle' | 'running'`); the last-event classification walks the session's append-only event log. The GUI list's own summary already carries a `running` boolean; the "who spoke last" bit is plugin-computable from session events.

Source: inline inspection of the DSH checkout v0.1.0-rc.8, 2025.

## Findings

1. **Agent liveness is a two-state enum.**
   - `AgentStatus = 'idle' | 'running'` — `dsh-agent/lib/types/runtime-types.d.ts:45`.
   - A `agent/status-changed` lifecycle event fires on `idle ⇄ running` transitions — `dsh-agent/lib/types/runtime-types.d.ts:161`.
   - The apiproxy reads live status as `ctx.agents.get(session.id)` then `agent?.status === "running"` — `dsh-host-apiproxy/lib/index.js:2161,2164`.

2. **The GUI session-list summary already exposes `running`.**
   - `summarize(session, running)` returns `{sessionId, updatedAt, running, blank, ...sessionListFields(...)}` — `dsh-host-apiproxy/lib/index.js:1230-1238`; header fields (`parentSessionId`, `origin`, `cwd`, `agentPreset`) at `:1217-1227`.
   - `listVisibleSessionSummaries` merges attached (in-memory) and cold (persistence) sessions, newest-first — `dsh-host-apiproxy/lib/index.js:2158-2202`; `sessions.list` RPC returns `{ items }` at `:2395`.

3. **"Who spoke last" is in the session event log.**
   - Events: `user/message` (UserMessage, with `source` — human prompt vs injected context vs goal round) — `dsh-session/lib/types/types.d.ts:262`; `assistant/message` (assembled assistant message per step, with `interrupted` marker) — `:279-285`; `turn/start` / `turn/end` (with `TurnEndReason`) — `:230-244`.
   - In-process, `ctx.sessions.list()` entries carry the full Session with `.events` (the apiproxy folds metadata over `session.events` — `dsh-host-apiproxy/lib/index.js:1231`).

4. **The predicate.**
   ```
   awaitingInput(sessionId) =
     let agent = ctx.agents.get(sessionId)
     let session = ctx.sessions.get(sessionId)
     agent !== undefined
     && agent.status === "idle"
     && lastModelVisibleEvent(session.events) === "assistant/message"
   ```
   where `lastModelVisibleEvent` scans events backwards for the newest `user/message` or `assistant/message`. The plugin can watch `agent/status-changed` for live transitions instead of polling.

5. **Failure modes (all tolerable in v1).**
   - *Fresh session, no messages*: no `assistant/message` → not "awaiting" (it is `running` anyway at spawn).
   - *Finished-quietly vs asked-a-question*: both are `idle` + assistant-last. The board cannot distinguish them from host state alone. v1 resolves this by design: done/blocked lives in the task files, the human is the authority (ticket 05), and the map view flags "session idle" for the human to click into. A worker discipline line in the spawn prompt ("end your turn with a question ONLY when you need input") keeps idle ≈ awaiting-or-finished.
   - *Cold/detached sessions*: no live agent → `running` false; last event must be read from persistence (`persistence.readFrom`, as the apiproxy's cold path does — `dsh-host-apiproxy/lib/index.js:1262`).

## Bottom line

No worker-written markers, no plugin-owned files. The map view derives per-task "waiting for you" from `ctx.agents`/`ctx.sessions` in-process state; the client-visible summary already ships the `running` half.
