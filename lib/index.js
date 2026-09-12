/**
 * dsh-wayfinder-ui —— lean DSH web-profile plugin.
 *
 * Three surfaces, no plugin-owned state:
 *   1. wayfinder_snippet        — prints the spawn-proposal protocol (propose →
 *                                 human approves → wayfinder_spawn_session once).
 *   2. wayfinder_spawn_session  — spawns one top-level DSH session per task in
 *                                 the registry at <root>/.wayfinder-runner/state.json
 *                                 (omitting `tasks` computes the todo frontier),
 *                                 each seeded with "/wayfinder work on
 *                                 task (TASK_ID)". Bootstrap lives in lib/session.js;
 *                                 model routing replicates installModelSelection
 *                                 inline (dsh-agent/lib/index.js:272-303).
 *
 * Works through injected Cordis services only.
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mapSessionsToTasks, seededForTask } from './state.js';
import { spawnTaskSession } from './session.js';
import { loadRegistry, saveRegistry, registryPath, mapCreate, mapSync, taskResolve, taskSetStatus, grillingStart } from './verbs.js';
import { selectMap, deriveStatus as deriveRegistryStatus } from './registry.js';
import { injectionText, WAYFINDER_CONTRACT, WAYFINDER_INJECTION_SOURCE } from './inject.js';

/** Optional peer: present inside DSH profiles; absent when tests import the entry cold. */
let createUserMessage;
try {
    ({ createUserMessage } = await import('@deepseek-ai/dsh-llm'));
}
catch { /* contract injection degrades to a no-op without it */ }

/** Cordis service injection: all services used in ctx (webServer via scoped inject in apply). */
export const inject = ['tools', 'agents', 'sessions', 'commands'];

/** Filesystem adapters handed to the core — real node:fs in production, fixtures in tests. */
const readFile = (file) => readFileSync(file, 'utf8');
const writeFile = (file, text) => writeFileSync(file, text, 'utf8');
const rename = (from, to) => renameSync(from, to);
const unlink = (path) => { try { unlinkSync(path); } catch { /* best effort */ } };
const io = { writeFile, rename, unlink };

/**
 * Shared client-side data source (ticket 04): the selected open map of the
 * REGISTRY at <root>/.wayfinder-runner/state.json, with per-task card-enum
 * statuses. One shape feeds every UI that polls it: the right rail and the
 * ambient sidebar marker. status mirrors the card enum; 'waiting' marks a task
 * whose session sits idle after an assistant message (the map decision
 * "awaiting-input visibility").
 */
function buildClientState(ctx) {
    const workspaces = typeof ctx.get('workspaceRegistry')?.list === 'function'
        ? ctx.get('workspaceRegistry').list()
        : [];
    return buildClientStateFrom({
        sessions: ctx.sessions.list(),
        agents: ctx.get('agents'),
        workspaces,
    });
}

/** Registry-derived status for one task row, upgraded by live session state when the registry says todo. */
function taskStatus(task, tasksById, live) {
    const derived = deriveRegistryStatus(task, tasksById);
    if (derived !== 'todo' || !live)
        return derived;
    const session = live.byTask.get(task.id)
        ?? (typeof task.spawnedSessionId === 'string' ? live.sessions.find((s) => s.id === task.spawnedSessionId || s.header?.id === task.spawnedSessionId) : undefined);
    const agent = session && live.agents ? live.agents.get(session.id ?? session.header?.id) : undefined;
    if (!agent)
        return derived;
    if (agent.status === 'running')
        return 'running';
    if (agent.status === 'idle') {
        // Awaiting-input detection mirrors lib/state.js deriveStatus: newest
        // model-visible event is assistant/message -> waiting.
        const events = session.events ?? [];
        for (let index = events.length - 1; index >= 0; index -= 1) {
            const type = events[index].type;
            if (type === 'assistant/message')
                return 'waiting';
            if (type === 'user/message')
                break;
        }
    }
    return derived;
}

/** Testable core of buildClientState. Roots checked: workspace directories, active sessions' cwds, process.cwd(). */
export function buildClientStateFrom({ sessions = [], agents, workspaces = [] }) {
    const candidateRoots = new Set();
    for (const ws of workspaces) {
        if (typeof ws?.path === 'string') candidateRoots.add(ws.path);
    }
    for (const s of sessions) {
        if (typeof s?.header?.cwd === 'string') candidateRoots.add(s.header.cwd);
    }
    candidateRoots.add(process.cwd());

    let root;
    let active;
    let reg;
    for (const candidate of candidateRoots) {
        if (!candidate || typeof candidate !== 'string') continue;
        const resolved = resolve(candidate);
        const loaded = loadRegistry(resolved, readFile);
        const map = selectMap(loaded);
        if (map) {
            root = resolved;
            active = map;
            reg = loaded;
            break;
        }
    }
    if (!active)
        return { kind: 'wayfinder/state', v: 1, root: process.cwd(), map: null, tasks: [] };

    const byId = new Map(active.tasks.map((task) => [task.id, task]));
    const live = { sessions, agents, byTask: mapSessionsToTasks(root, sessions) };
    // Boot-time live re-association (ticket fqt2kyq7): when a row's
    // spawnedSessionId is missing or stale (session ids do not survive some
    // restores) but its seeded session IS live, write the match back onto the
    // row and persist — piggybacking on this poll so restart restoration can
    // light running/waiting up from the state file + live sessions alone.
    let dirty = false;
    for (const task of active.tasks) {
        const matched = live.byTask.get(task.id);
        if (!matched)
            continue;
        const listed = typeof task.spawnedSessionId === 'string'
            && live.sessions.some((s) => s.id === task.spawnedSessionId || s.header?.id === task.spawnedSessionId);
        const id = matched.id ?? matched.header?.id;
        if (!listed && typeof id === 'string') {
            task.spawnedSessionId = id;
            dirty = true;
        }
    }
    if (dirty) {
        try {
            saveRegistry(root, reg, io); // best effort: persistence failure must not break the payload
        }
        catch { /* swallowed */ }
    }
    const linkedSession = (task) => live.byTask.get(task.id)
        ?? (typeof task.spawnedSessionId === 'string'
            ? live.sessions.find((s) => s.id === task.spawnedSessionId || s.header?.id === task.spawnedSessionId)
            : undefined);
    const tasks = active.tasks.map((task) => {
        const session = linkedSession(task);
        const status = taskStatus(task, byId, live);
        return {
            id: task.id,
            title: task.title,
            type: task.type,
            status,
            // A grilling batch is LIVE (flame lit) while its task is a grilling
            // type, its session reported grilling (grillingSince stamped), and
            // the task is not yet resolved. Resolve -> status done -> flame off.
            grilling: task.type === 'grilling' && typeof task.grillingSince === 'number' && task.grillingSince > 0 && status !== 'done',
            blockedBy: task.blockedBy,
            sessionId: session?.id ?? task.spawnedSessionId ?? undefined,
            sessionTitle: session?.header?.title ?? undefined,
        };
    });
    // createdBySessionId lets the in-session dock scope itself to the session
    // that charted the map; the rail/ambient surfaces deliberately ignore it.
    return { kind: 'wayfinder/state', v: 1, root, map: { name: active.name, title: active.name, createdBySessionId: active.createdBySessionId }, tasks };
}

/** Resolve and validate the project root argument. */
function resolveRoot(raw) {
    if (typeof raw !== 'string' || raw.trim() === '')
        throw new Error('root is required: pass the wayfinder project directory');
    return resolve(raw.trim());
}

/** Human-readable error message (tool-safe stringification). */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Spawn-proposal protocol (wayfinder_snippet).
// ---------------------------------------------------------------------------

const SPAWN_PROTOCOL = [
    'Wayfinder spawn protocol (how to use wayfinder_spawn_session):',
    '1. Read the registry at <root>/.wayfinder-runner/state.json: the target map is the selected open map, and a task is READY when its derived status is todo (done tasks and tasks blocked by an undone blocker are skipped). Calling wayfinder_spawn_session WITHOUT `tasks` spawns exactly this ready frontier itself.',
    '2. PROPOSE the spawn to the human: list the ready task ids and what each one will do.',
    '3. ASK for explicit approval. Only after the human says yes, call wayfinder_spawn_session exactly once with root and the approved task ids.',
    '4. Never call wayfinder_spawn_session without prior approval. If the human changes the task set, re-propose and re-confirm before calling again.',
    '5. Each spawned session is seeded with "/wayfinder work on task (TASK_ID) of map (MAP_NAME)" (the leading /wayfinder gesture makes the harness inject the skill content, like a human slash invocation) plus a "Task locator: ..." line pointing at the task\'s work — routed by inheritance: each session defaults to THIS session\'s provider/model unless you pass explicit provider/model arguments to wayfinder_spawn_session.',
    '6. Report the returned session ids to the human: each is a top-level session visible and openable in the GUI session list.',
].join('\n');

// ---------------------------------------------------------------------------
// Tools.
// ---------------------------------------------------------------------------

function buildSnippetTool() {
    return {
        name: 'wayfinder_snippet',
        description: 'Print the wayfinder spawn protocol: propose ready wayfinder tasks to the human, ask for explicit approval, then call wayfinder_spawn_session exactly once; never spawn without approval. Also documents the seed message format and the route-inheritance rule.',
        parameters: { type: 'object', properties: {}, required: [] },
        output: {
            schema: { type: 'object', properties: { text: { type: 'string' } }, additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: (value && typeof value.text === 'string') ? value.text : '' }],
        },
        async execute() {
            return { text: SPAWN_PROTOCOL };
        },
    };
}

/** Testable core of the spawn tool: exported for registry-fixture tests, like buildClientStateFrom. */
export function buildSpawnTool(ctx) {
    const deps = { agents: ctx.agents, sessions: ctx.sessions, workspaceRegistry: ctx.get?.('workspaceRegistry') };
    // Throws on bad input / no open map; per-task failures are isolated into
    // results.
    const spawnTasks = async (args, route) => {
        const root = resolveRoot(args.root);
        const requested = Array.isArray(args.tasks)
            ? args.tasks.filter((id) => typeof id === 'string' && id.trim() !== '')
            : (typeof args.task === 'string' && args.task.trim() !== '' ? [args.task] : []);
        let reg = loadRegistry(root, readFile);
        const map = args.mapId
            ? reg.maps.find((entry) => entry.id === args.mapId)
            : selectMap(reg);
        if (!map) {
            const validIds = reg.maps.map((entry) => entry.id).join(', ') || 'none';
            throw new Error(args.mapId
                ? `unknown map '${args.mapId}' in the wayfinder registry at ${root} (valid map ids: ${validIds}) — create one with wayfinder_map_create`
                : `no open map available in the wayfinder registry at ${root} (map ids: ${validIds}) — create one with wayfinder_map_create`);
        }
        const byId = new Map(map.tasks.map((task) => [task.id, task]));
        // Omitted tasks -> the ready frontier: derived status must be todo (done
        // and blocked-by-undone rows are skipped).
        const ids = requested.length > 0 ? requested : [...byId.values()].filter((task) => deriveRegistryStatus(task, byId) === 'todo').map((task) => task.id);
        const spawn = async (taskId) => {
            const task = byId.get(taskId);
            if (task === undefined)
                return { task: taskId, error: `task ${taskId}: not found in registry map '${map.name}' (${map.id}; its tasks: ${[...byId.keys()].join(', ')})` };
            if (requested.length > 0) {
                // Explicit asks are gated on readiness too: never spawn done/blocked work.
                const derived = deriveRegistryStatus(task, byId);
                if (derived !== 'todo')
                    return { task: taskId, error: `task ${taskId}: not ready (derived status '${derived}') — only todo tasks can be spawned` };
            }
            try {
                const grillingNote = task.type === 'grilling'
                    ? '\nThis is a grilling task: when you begin grilling and await the user, call wayfinder_grilling_start {root, taskId} once to light the batch flame in the wayfinder panels.'
                    : '';
                const seed = seededForTask(map.name, task.id, task.locator) + grillingNote;
                return await spawnTaskSession(deps, { root, taskId, provider: route?.provider, model: route?.model, seed, callerSessionId: route?.callerSessionId });
            }
            catch (error) {
                return { task: taskId, error: errorMessage(error) };
            }
        };
        const settled = await Promise.allSettled(ids.map(spawn));
        // Normalize spawnTaskSession's taskId echo onto `task`; spreads keep error rows intact.
        const results = settled.map((result) => result.status === 'fulfilled'
            ? { ...result.value, task: result.value.taskId ?? result.value.task }
            : { task: '?', error: errorMessage(result.reason) });
        // Reload fresh: spawns may have taken a while and the registry may have
        // changed underneath us. Newest spawn wins on spawnedSessionId.
        reg = loadRegistry(root, readFile);
        for (const result of results) {
            const row = reg.maps.find((entry) => entry.id === map.id)?.tasks.find((task) => task.id === result.task);
            if (row && typeof result.sessionId === 'string')
                row.spawnedSessionId = result.sessionId;
        }
        saveRegistry(root, reg, io) || results.push({ task: '?', error: `registry update failed: could not persist spawnedSessionIds to ${registryPath(root)} (sessions are running regardless)` });
        return results;
    };
    return {
        name: 'wayfinder_spawn_session',
        description: 'Spawn one top-level DSH session per wayfinder task, in parallel, from the registry at <root>/.wayfinder-runner/state.json. Targets the selected open map (pass mapId to pick another); pass their task ids in `tasks` (or a single one as `task`) or omit them to spawn the computed frontier of ready todo tasks (done/blocked skipped). Each session is seeded with "/wayfinder work on task (TASK_ID) of map (MAP_NAME)" plus its Task locator line, joins the spawning session\'s workspace, and inherits the spawning session\'s route (provider/model) unless overridden per call. Per-task failures are isolated and never fatal.',
        parameters: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Wayfinder project root directory containing .wayfinder-runner/state.json.' },
                mapId: { type: 'string', description: 'Target map id; omit to use the selected open map.' },
                tasks: { type: 'array', items: { type: 'string' }, description: 'Task ids to spawn (e.g. ["03","05"]); omit to spawn every ready (todo-frontier) task.' },
                task: { type: 'string', description: 'Single task id alias for `tasks`.' },
                provider: { type: 'string', description: 'Optional route override for the spawned sessions; defaults to the calling session\'s effective provider.' },
                model: { type: 'string', description: 'Optional route override for the spawned sessions; defaults to the calling session\'s effective model.' },
            },
            required: ['root'],
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    results: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                task: { type: 'string' },
                                sessionId: { type: 'string' },
                                error: { type: 'string' },
                            },
                            additionalProperties: true,
                        },
                    },
                },
                additionalProperties: true,
            },
            render: (_args, value) => {
                const results = value && Array.isArray(value.results) ? value.results : [];
                const lines = [];
                for (const result of results) {
                    if (result && result.error)
                        lines.push(`task ${result.task}: FAILED — ${result.error}`);
                    else if (result)
                        lines.push(`task ${result.task}: spawned session ${result.sessionId}`);
                }
                return [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : 'no ready tasks: every task is done or blocked' }];
            },
        },
        async execute(rawArgs, exec) {
            const args = (typeof rawArgs === 'object' && rawArgs !== null) ? rawArgs : {};
            // Effective route: explicit args beat the calling session's current
            // selection (request header first — it is what the last turn ran
            // under — then its agent options). Empty/absent falls through.
            const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '' ? value : undefined;
            const headerCfg = exec?.agent?.session?.requestHeader?.()?.config;
            const opts = exec?.agent?.options;
            return { results: await spawnTasks(args, {
                provider: nonEmpty(args.provider) ?? nonEmpty(headerCfg?.provider) ?? nonEmpty(opts?.provider),
                model: nonEmpty(args.model) ?? nonEmpty(headerCfg?.model) ?? nonEmpty(opts?.model),
                callerSessionId: sessionIdOf(exec) ?? undefined,
            }) };
        },
    };
}

// ---------------------------------------------------------------------------
// Registry-mutation verb tools (wrap lib/verbs.js).
// ---------------------------------------------------------------------------

/** The calling agent's session id (moving-target pattern), or null outside a session. */
const sessionIdOf = (exec) => exec?.agent?.session?.header?.id ?? null;

/** Load the registry for root (missing file = empty), run one mutating verb, persist. Throws actionable errors; returns the map row the verb touched (verbs report it — re-deriving via selectMap after a mutation can pick a different map). */
function runVerb(root, mutate) {
    mkdirSync(resolve(root, '.wayfinder-runner'), { recursive: true });
    const reg = loadRegistry(root, readFile);
    const result = mutate(reg);
    if (!result.ok)
        throw new Error(`wayfinder: ${result.error}`);
    if (!saveRegistry(root, reg, io))
        throw new Error(`wayfinder: failed to write registry at ${registryPath(root)}`);
    return { registry: reg, map: result.map ?? selectMap(reg) };
}

/** Shared output shape/render for all four verb tools. */
const VERB_OUTPUT = {
    schema: {
        type: 'object',
        properties: {
            mapId: { type: 'string' },
            mapName: { type: 'string' },
            tasks: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' } }, additionalProperties: true } },
        },
        additionalProperties: true,
    },
    render: (_args, value) => [{
        type: 'text',
        text: value && value.mapId
            ? `map ${value.mapName} (${value.mapId}):\n${(value.tasks ?? []).map((t) => `  ${t.id}: ${t.status}`).join('\n')}`
            : 'wayfinder: no open map in registry',
    }],
};

/** Summarize a map row into the shared output shape. */
const summarize = (map) => ({
    mapId: map.id,
    mapName: map.name,
    tasks: map.tasks.map((t) => ({ id: t.id, status: t.status })),
});

function buildVerbTools(ctx) {
    void ctx; // verbs need no services today; signature kept for parity with other builders

    const mapCreateTool = () => ({
        name: 'wayfinder_map_create',
        description: "Create a new wayfinder task map persisted at <root>/.wayfinder-runner/state.json. Pass root, a non-empty name, and tasks: [{id, title, type?, locator, blockedBy?}] where locator is where the task's work lives (e.g. an issue-file path or spec reference) and blockedBy lists prerequisite task ids. Validates every task and throws an actionable error on bad input; on success the new map becomes the selected open map and its full task/status list is returned. Use this to start tracking multi-session work.",
        parameters: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Wayfinder project root directory; the registry is created under <root>/.wayfinder-runner/.' },
                name: { type: 'string', description: 'Map name; must be unique per create.' },
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Task id, e.g. "01".' },
                            title: { type: 'string', description: 'Short human-readable title.' },
                            type: { type: 'string', description: 'Optional task type tag.' },
                            locator: { type: 'string', description: 'Non-empty pointer to the work (issue file path, spec ref).' },
                            blockedBy: { type: 'array', items: { type: 'string' }, description: 'Ids of tasks that must be done first.' },
                        },
                        required: ['id', 'title', 'locator'],
                    },
                    description: 'Initial task rows; all start todo/unspawned.',
                },
            },
            required: ['root', 'name', 'tasks'],
        },
        output: VERB_OUTPUT,
        async execute(rawArgs, exec) {
            const args = (typeof rawArgs === 'object' && rawArgs !== null) ? rawArgs : {};
            const root = resolveRoot(args.root);
            const nowMs = Date.now();
            const { map } = runVerb(root, (reg) => {
                const result = mapCreate({ root, name: args.name, tasks: args.tasks }, reg, nowMs);
                if (result.ok)
                    result.registry.maps.find((m) => m.id === result.registry.selectedMapId).createdBySessionId = sessionIdOf(exec);
                return result;
            });
            return summarize(map);
        },
    });

    const taskResolveTool = () => ({
        name: 'wayfinder_task_resolve',
        description: "Mark one wayfinder task done because a worker session finished it (worker report path). Resolves taskId against the selected open map of the registry at <root>/.wayfinder-runner/state.json — pass mapId only to target a specific map — sets its status to done, stamps spawnedSessionId with THIS calling session's id when the task was never linked to a session, and persists atomically. Throws actionable errors naming valid map/task ids on unknown inputs. Call this instead of wayfinder_task_set_status when reporting completion from spawned work.",
        parameters: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Wayfinder project root directory containing .wayfinder-runner/state.json.' },
                mapId: { type: 'string', description: 'Target map id; omit to use the selected open map.' },
                taskId: { type: 'string', description: 'Id of the task to mark done, e.g. "03".' },
            },
            required: ['root', 'taskId'],
        },
        output: VERB_OUTPUT,
        async execute(rawArgs, exec) {
            const args = (typeof rawArgs === 'object' && rawArgs !== null) ? rawArgs : {};
            const root = resolveRoot(args.root);
            const { map } = runVerb(root, (reg) => taskResolve({ root, mapId: args.mapId, taskId: args.taskId, spawnedSessionId: sessionIdOf(exec) }, reg));
            return summarize(map);
        },
    });

    const taskSetStatusTool = () => ({
        name: 'wayfinder_task_set_status',
        description: "Manually set one wayfinder task's status in the selected open map of <root>/.wayfinder-runner/state.json (pass mapId to target a specific map). status must be one of todo|done|running|waiting|blocked; anything else throws with the valid list. This is the manual override path — prefer wayfinder_task_resolve for worker completion reports. Persists atomically and returns the map's full task/status list.",
        parameters: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Wayfinder project root directory containing .wayfinder-runner/state.json.' },
                mapId: { type: 'string', description: 'Target map id; omit to use the selected open map.' },
                taskId: { type: 'string', description: 'Id of the task to update, e.g. "02".' },
                status: { type: 'string', description: 'One of: todo, done, running, waiting, blocked.' },
            },
            required: ['root', 'taskId', 'status'],
        },
        output: VERB_OUTPUT,
        async execute(rawArgs) {
            const args = (typeof rawArgs === 'object' && rawArgs !== null) ? rawArgs : {};
            const root = resolveRoot(args.root);
            const { map } = runVerb(root, (reg) => taskSetStatus({ root, mapId: args.mapId, taskId: args.taskId, status: args.status }, reg));
            return summarize(map);
        },
    });

    const mapSyncTool = () => ({
        name: 'wayfinder_map_sync',
        description: "Create-or-replace a wayfinder map by name at <root>/.wayfinder-runner/state.json: doubles as the /wayfinder-map-sync recovery hatch. If a map with this exact name exists, its whole task list is replaced in place (id/createdAt kept, updatedAt bumped, selection untouched); otherwise it is created fresh like wayfinder_map_create and stamped createdBySessionId = this calling session. Pass root, name, and the complete desired tasks: [{id, title, type?, locator, blockedBy?}] — replacement drops any statuses/spawned links not re-supplied, so always send the full task set. Returns the resulting task/status list.",
        parameters: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Wayfinder project root directory containing .wayfinder-runner/state.json.' },
                name: { type: 'string', description: 'Exact map name to create or replace (matched by name).' },
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Task id, e.g. "01".' },
                            title: { type: 'string', description: 'Short human-readable title.' },
                            type: { type: 'string', description: 'Optional task type tag.' },
                            locator: { type: 'string', description: 'Non-empty pointer to the work (issue file path, spec ref).' },
                            blockedBy: { type: 'array', items: { type: 'string' }, description: 'Ids of tasks that must be done first.' },
                        },
                        required: ['id', 'title', 'locator'],
                    },
                    description: 'Complete desired task rows (all reset to todo/unspawned).',
                },
            },
            required: ['root', 'name', 'tasks'],
        },
        output: VERB_OUTPUT,
        async execute(rawArgs, exec) {
            const args = (typeof rawArgs === 'object' && rawArgs !== null) ? rawArgs : {};
            const root = resolveRoot(args.root);
            const nowMs = Date.now();
            const { map } = runVerb(root, (reg) => {
                const existed = Array.isArray(reg.maps) && reg.maps.some((m) => m.name === args.name);
                const result = mapSync({ root, name: args.name, tasks: args.tasks }, reg, nowMs);
                if (result.ok && !existed)
                    result.registry.maps.find((m) => m.name === args.name).createdBySessionId = sessionIdOf(exec);
                return result;
            });
            return summarize(map);
        },
    });

    const grillingStartTool = () => ({
        name: 'wayfinder_grilling_start',
        description: "Report that a grilling task's session has begun grilling a batch and is awaiting the user. Resolves taskId against the selected open map of <root>/.wayfinder-runner/state.json (pass mapId to target a specific map), stamps grillingSince on the row (which lights the flame in the wayfinder panels), links this session to the task when it was never linked, and persists atomically. A grilling session calls this exactly once when it starts grilling; wayfinder_task_resolve clears the flame when the task resolves. Throws actionable errors on unknown map/task ids.",
        parameters: {
            type: 'object',
            properties: {
                root: { type: 'string', description: 'Wayfinder project root directory containing .wayfinder-runner/state.json.' },
                mapId: { type: 'string', description: 'Target map id; omit to use the selected open map.' },
                taskId: { type: 'string', description: 'Id of the grilling task now awaiting the user, e.g. "03".' },
            },
            required: ['root', 'taskId'],
        },
        output: VERB_OUTPUT,
        async execute(rawArgs, exec) {
            const args = (typeof rawArgs === 'object' && rawArgs !== null) ? rawArgs : {};
            const root = resolveRoot(args.root);
            const nowMs = Date.now();
            const { map } = runVerb(root, (reg) => grillingStart({ root, mapId: args.mapId, taskId: args.taskId, sessionId: sessionIdOf(exec) }, reg, nowMs));
            return summarize(map);
        },
    });

    return [mapCreateTool(), taskResolveTool(), taskSetStatusTool(), mapSyncTool(), grillingStartTool()];
}

// ---------------------------------------------------------------------------
// Plugin entry.
// ---------------------------------------------------------------------------

export function apply(ctx) {
    // Cold-start contract injection (moving-target pattern): teach every NEW
    // top-level session the three registry verbs. Resume/compact already carry
    // context; subagents get their task seed instead.
    ctx.on('agent/session-start', ({ agent, source }) => {
        const header = agent?.session?.header;
        if (!createUserMessage)
            return;
        const text = injectionText(header, source);
        if (text !== null)
            agent.inject(createUserMessage({ content: [{ type: 'text', text }], source: WAYFINDER_INJECTION_SOURCE }));
    });
    // Recovery hatch for in-flight sessions: /wayfinder-map-sync re-teaches the
    // same contract on demand.
    ctx.effect?.(() => ctx.commands?.register({
        name: 'wayfinder-map-sync',
        description: 'Re-inject the wayfinder registration contract (map_create / task_resolve / map_sync) into this session',
        handler: ({ agent }) => {
            if (!createUserMessage || !agent)
                return { kind: 'error', text: 'No agent to steer in this context' };
            agent.steer(createUserMessage({ content: [{ type: 'text', text: WAYFINDER_CONTRACT }], source: WAYFINDER_INJECTION_SOURCE }));
            return { kind: 'success', text: 'Wayfinder contract injected: call wayfinder_map_create after charting, wayfinder_task_resolve when a spawned task resolves, wayfinder_map_sync if the dashboard is missing a map.' };
        },
    }), 'wayfinder-map-sync command');
    // Client data route (ticket 04): /dsh-wayfinder/state.json — the one shared
    // source every UI polls (dock, rail, ambient marker). Same-origin only (the
    // web GUI serves this route); degrades to { map: null, tasks: [] } outside
    // a wayfinder root so the surfaces tear down instead of erroring.
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.webServer.register({
            kind: 'prefix',
            path: '/dsh-wayfinder',
            handler(req, res) {
                const url = new URL(req.url ?? '/', 'http://x');
                if (url.pathname === '/dsh-wayfinder/state.json') {
                    let body;
                    try {
                        body = JSON.stringify(buildClientState(ctx));
                    }
                    catch {
                        body = JSON.stringify({ kind: 'wayfinder/state', v: 1, map: null, tasks: [] });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(body);
                    return;
                }
                res.writeHead(404);
                res.end();
            },
        });
    });
    ctx.tools.register(buildSnippetTool());
    ctx.tools.register(buildSpawnTool(ctx));
    for (const tool of buildVerbTools(ctx))
        ctx.tools.register(tool);
}
