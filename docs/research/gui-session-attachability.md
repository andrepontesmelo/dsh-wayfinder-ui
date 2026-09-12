# GUI attachability of plugin-spawned sessions

**Verdict: VISIBLE + OPENABLE (with two caveats).** A Cordis plugin running in the *web* host profile that calls `ctx.agents.create()` (dsh-headless pattern) creates a session that IS listed in the Web GUI and CAN be opened + continued by a human — as long as it is a **top-level session** (no subagent owner) and is **flushed** (with `meta.cwd` set, which the headless pattern does).

Source: background research agent, redesign session 2025, against the installed DSH checkout v0.1.0-rc.7.

## Numbered findings

1. **Session list is built from the host's shared store — ALL sessions, no origin filter.**
   - Host RPC `sessions.list` returns `listVisibleSessionSummaries()`: `dsh-host-apiproxy/lib/index.js:2419-2421`.
   - `listVisibleSessionSummaries` merges in-memory `ctx.sessions.list()` + cold `persistence.list()`, newest-first: `dsh-host-apiproxy/lib/index.js:2193, 2196-2224`. It lists **everything the host knows**; nothing filters by "client-created". The only cold filter is `meta.cwd !== void 0` (line 2198).
   - Browser client enumerates via `refreshList()` → `this.api.sessions.list({})`: `dsh-client-runtime/lib/client.js:8071,8075,8081`.

2. **Plugin-created and client-created sessions land in the SAME store the GUI reads.**
   - `ctx.agents.create()` → dsh-agent → factory `createAgent` → `sessions.prepare(...)` + `publish` → `ctx.sessions.enter()` (registers in `ctx.sessions`): `dsh-agent-loop/lib/index.js:1217-1225`; store `enter` at `dsh-session/lib/index.js:1691-1707`.
   - The client-driven host create path is `ensureSession` → `ctx.agents.create` too: `dsh-host-apiproxy/lib/index.js:2133-2141`. Both routes converge on the same `ctx.sessions` registry + persistence. dsh-headless pattern identical: `dsh-headless/lib/index.js:70-83`.
   - In the web profile the plugin and dsh-host-apiproxy share one cordis `ctx`, so `ctx.get("agents")`/`ctx.sessions` are the same instances.

3. **Open + continue = resume-by-id, enabled by default.**
   - Client opens any listed summary: `sessions.select(sessionId)` `dsh-client-runtime/lib/client.js:7863-7872`; `sessions.open(sessionId)` `dsh-client-ui-conversation/lib/client.js:9900`.
   - Client message send addresses by id: `this.api.sessions.prompt({ sessionId, mode, content })`: `dsh-client-runtime/lib/client.js:7204-7209`.
   - Host `sessions.prompt` → `turnAgentFor` → `agentFor`: `dsh-host-apiproxy/lib/index.js:2767-2776, 2293-2307`.
   - `agentFor` reuses the live agent by id, else **resumes the SAME conversation** via `ctx.agents.resume({ resumeSessionId: sessionId })` from persistence: `dsh-api-remotes/lib/index.js:109-128` (resume at 124-128). This exactly implements "continue the same conversation".

4. **Smallest gap-to-visible: none needed — it already works; the only exclusions are subagent-owned sessions.**
   - Host routing rejects a session only when it is subagent-owned: `header.origin === "subagent"` OR (has live `header.parentSession` owned by that parent): `dsh-api-remotes/lib/index.js:55-61`. A host plugin's `ctx.agents.create()` with a fresh plain sessionId (no parentSession) is not subagent-owned → fully visible + resumable.
   - Caveat A (durability/cold-list after host restart): must `sessions.flush(agent.session)` — `dsh-headless/lib/index.js:94` — else the session is only attached in memory. Not needed for immediate visibility while live.
   - Caveat B: must set `meta: { cwd }` (headless does: `dsh-headless/lib/index.js:72`), because both the cold-list filter (`dsh-host-apiproxy/lib/index.js:2198`) and cold inspect (`dsh-api-remotes/lib/index.js:85`) require `cwd !== void 0`.

5. **No cwd/workspace scoping — a per-card cwd does NOT hide it.**
   - JSONL `list()` iterates ALL project dirs under the root: `listArtifacts` → `listProjectDirs` at `dsh-session-persistence-jsonl/lib/index.js:1060-1095` (loop at 1066) and `listProjectDirs` readdirs the whole root `1377-1386`. Host list has no cwd filter.
   - Resume uses the session's stored header cwd (loaded from persistence), not a client-supplied `defaults.cwd` (`agentFor` → inspect → resume at `dsh-api-remotes/lib/index.js:118-128`). The client prompt sends no cwd (client-runtime 7204-7209), so cwd never conflicts on resume. (Only the client `create` RPC resolves cwd from workspace/defaults: `dsh-host-apiproxy/lib/index.js:2529` — irrelevant to prompt/resume.)

6. **Bonus disk evidence.**
   - `~/.dsh/sessions/` is organized `<encoded-cwd>/<sessionid>/session.jsonl.zstd` (e.g. `--home-andre-git-gr--/<uuid>/session.jsonl.zstd`), matching the jsonl `projectDir`/`sessionDir` encoding (`dsh-session-persistence-jsonl/lib/index.js:133-148`).
   - Both CLI UUID ids AND headless-style `session-<uuid>` ids coexist (e.g. `session-135c0cba-...`, `session-d7be38b2-...`), demonstrating that non-client-created (headless/plugin) sessions already share the same on-disk store that the GUI lists.
   - The web profile is a normal host composition (`~/.dsh/profiles/web/cordis.yml` is empty `[]` + `cordis.patch.yml` overlays), so it mounts the host plugins + `session-persistence-jsonl` from base.

## Bottom line

A plugin-spawned session via `ctx.agents.create()` is **already listable and openable/resumable in the GUI** with no new mechanism — provided (1) it is created as a top-level (non-subagent) session, (2) `meta.cwd` is set (headless default), and (3) you call `sessions.flush()` for durability so it survives restarts and cold-lists. A per-card cwd does not hide it. These three conditions are exactly what `dsh-headless` already satisfies.
