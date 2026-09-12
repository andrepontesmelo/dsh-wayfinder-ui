/**
 * dsh-wayfinder-ui — session bootstrap core.
 *
 * One deep interface: spawnTaskSession(deps, { root, taskId, provider, model,
 * seed, callerSessionId })
 * -> { sessionId }. Plain data in, plain data out; the implementation absorbs
 * everything a caller must otherwise know about starting one top-level DSH
 * session for a wayfinder task: session id minting, the seed message, the
 * agent followup shape, idle waits, persistence flush, and the provider/model
 * routing event wiring.
 *
 * deps are injected structurally (the same seam discipline as lib/state.js):
 *   deps.agents.create(...)        — Cordis agents service in production, fake in tests
 *   deps.sessions.flush(s)         — Cordis sessions service in production, fake in tests
 *   deps.workspaceRegistry         — optional Cordis workspace registry; when present and the
 *                                    CALLING session belongs to a workspace, the spawned
 *                                    session joins that same workspace (fork semantics) so it
 *                                    groups in the GUI alongside its siblings; an ungrouped or
 *                                    unresolvable caller leaves the spawn Ungrouped — no
 *                                    workspace is ever invented for that case
 *
 * Model routing replicates installModelSelection (dsh-agent/lib/index.js
 * 272-303) inline — immutable per spawned agent, so the simplified mutable
 * selection { current, assembled } is safe.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { seedFor } from './state.js';

/** Replicates installModelSelection (dsh-agent/lib/index.js:272-303). */
export function installModelSelection(agentCtx, provider, model) {
    const selection = { current: { provider, model }, assembled: undefined };
    agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const selected = selection.current;
        const assembled = await next();
        selection.assembled = selected;
        if (selected === undefined)
            return assembled;
        return {
            ...assembled,
            variables: {
                ...(assembled.variables ?? {}),
                provider: selected.provider,
                model: selected.model,
            },
        };
    });
    agentCtx.on('agent/request', async (_payload, next) => {
        const resolved = await next();
        const selected = selection.assembled;
        if (selected === undefined)
            return resolved;
        const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved;
        return {
            ...withoutInheritedEffort,
            provider: selected.provider,
            model: selected.model,
            ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
        };
    });
}

/**
 * Attach the spawned session to the workspace that already owns the CALLING
 * session (fork semantics: `workspaceRegistry.list()` scan over `sessionIds`),
 * mirroring how the host accounts forked sessions (dsh-host-apiproxy fork →
 * workspace.attachSession). A caller belonging to no workspace stays put: the
 * spawn is NOT attached anywhere and NO workspace is created for `root` — an
 * Ungrouped spawner must not invent grouping. The session's cwd is mkdir'd
 * before the attach attempt because attachSession validates that cwd via
 * realpath (the host pre-creates the directory; nothing else guarantees it
 * here). Failures degrade to Ungrouped, never fail the spawn.
 */
async function accountSession(deps, root, sessionId, callerSessionId) {
    const registry = deps.workspaceRegistry;
    if (registry === undefined || typeof callerSessionId !== 'string' || callerSessionId === '')
        return;
    try {
        let workspace;
        for (const candidate of registry.list()) {
            if (candidate.sessionIds.includes(callerSessionId)) {
                workspace = candidate;
                break;
            }
        }
        if (workspace === undefined)
            return; // ungrouped caller → ungrouped spawn
        mkdirSync(root, { recursive: true }); // attachSession realpaths the session cwd
        await workspace.attachSession(sessionId);
    }
    catch (error) {
        // No workspace grouping beats a failed spawn: degrade to Ungrouped,
        // but loudly — silent swallowing here cost a debugging round once.
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[wayfinder-runner] workspace accounting skipped for ${sessionId}: ${message}`);
    }
}

/**
 * Spawn one top-level DSH session seeded to work on `taskId`, and wait until
 * its first turn settles. Resolves with the created sessionId; rejects on any
 * bootstrap failure so per-task isolation upstream can catch it.
 * provider/model - the resolved route for this spawn (caller's inherited route
 *   with any per-call overrides already applied); when BOTH are undefined no
 *   selection is pinned, leaving the platform's default routing alone.
 * callerSessionId - the spawning session's id, used to find the workspace the
 *   spawn should join (see accountSession).
 * seed - optional full seed text; default seedFor(taskId)
 */
export async function spawnTaskSession(deps, { root, taskId, provider, model, seed, callerSessionId }) {
    const sessionId = `session-${randomUUID()}`;
    const { agent } = await deps.agents.create({
        sessionId,
        meta: { cwd: root },
        agentOptions: { provider, model },
        // Join the default agent preset (the one supported call site — the
        // factory setup window), or the spawned session sees an empty tool
        // registry (no bash/editor/etc.) on the web profile where every
        // model-facing row sits behind presets. Then pin provider/model — but
        // only when a route exists at all: pinning an all-undefined selection
        // would clobber the platform default instead of inheriting it.
        setup: async (agentCtx) => {
            await agentCtx.get('agentPresets')?.mount(agentCtx);
            if (provider !== undefined || model !== undefined)
                installModelSelection(agentCtx, provider, model);
        },
    });
    await agent.whenIdle();
    agent.followup({
        id: `msg-${randomUUID()}`,
        role: 'user',
        content: [{ type: 'text', text: seed ?? seedFor(taskId) }],
        source: { kind: 'user' },
    });
    await agent.whenIdle();
    await deps.sessions.flush(agent.session);
    await accountSession(deps, root, sessionId, callerSessionId);
    // Echo taskId so the spawn tool's result rows never render "task undefined".
    return { taskId, sessionId };
}
