/**
 * Tests for lib/state.js (seed/session matching), the registry
 * (lib/registry.js + lib/verbs.js), and a thin smoke test of the plugin wiring. No Cordis, no GUI: the core is exercised through real temp-dir
 * fixtures with the same fs adapters the plugin registers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapCreate } from '../lib/verbs.js';
import { mapSessionsToTasks, seedFor, seededForTask, SEED_MESSAGE, SEEDED_FOR_TASK } from '../lib/state.js';
import { spawnTaskSession } from '../lib/session.js';

const readFile = (file) => readFileSync(file, 'utf8');
const repoCwdE2E = process.cwd(); // repo cwd before any fixture chdir (restart-cycle test restores it)

// task file bodies -------------------------------------------------------------
const RESOLVED = '# Research map\nType: research\nStatus: resolved\n';
const OPEN_01 = '# Initial foundation\nType: research\n';
const OPEN_02 = '# Prototype\nType: prototype\nBlocked by: 01\n';
const OPEN_03 = '# Polish\nType: task\nBlocked by: 02, 04\n';
const OPEN_04 = '# Missing dep\nBlocked by: 99\n';
const CLOSED_10 = '# Old work\nStatus: resolved\n';


test('mapSessionsToTasks matches cwd + seed message', () => {
    const s1 = { id: 's1', header: { cwd: '/p' }, events: [{ type: 'user/message', data: { content: [{ type: 'text', text: seedFor('03') }] } }] };
    const s2 = { id: 's2', header: { cwd: '/other' }, events: [{ type: 'user/message', data: { content: [{ type: 'text', text: seedFor('04') }] } }] };
    const byTask = mapSessionsToTasks('/p', [s1, s2]);
    assert.equal(byTask.get('03'), s1);
    assert.equal(byTask.has('04'), false);
    assert.match(seedFor('07'), SEED_MESSAGE);
});

test('seededForTask round-trips through SEEDED_FOR_TASK (spawn site builds via this contract)', () => {
    const seed = seededForTask('Demo', '03', 'docs/spec.md');
    assert.match(seed, SEEDED_FOR_TASK);
    const match = SEEDED_FOR_TASK.exec(seed);
    assert.equal(match[1], '03');
    assert.equal(match[2], 'Demo');
    assert.ok(seed.endsWith('Task locator: docs/spec.md'));
    // Bare form (no locator) stays matchable too.
    assert.match(seededForTask('Demo', '03'), SEEDED_FOR_TASK);
});

// ---------- session bootstrap (lib/session.js) ----------
/** Fake Cordis services: records the create call and replays the setup hooks. */
function fakeDeps({ failCreate = false } = {}) {
    const calls = { create: undefined, followup: undefined, flush: [] };
    const handlers = {};
    let agent;
    const agentCtx = {
        on: (event, handler) => { handlers[event] = handler; },
        get: () => undefined, // no agentPresets service in the fake: mount is skipped
    };
    const deps = {
        agents: {
            async create(input) {
                calls.create = input;
                if (failCreate)
                    throw new Error('agents unavailable');
                await input.setup(agentCtx);
                return { agent };
            },
        },
        sessions: {
            async flush(session) { calls.flush.push(session); },
        },
    };
    agent = {
        session: 'sess-1',
        async whenIdle() {},
        followup(msg) { calls.followup = msg; },
    };
    return { deps, calls, handlers, agentCtx };
}

test('spawnTaskSession: happy path — seed message, id minting, flush', async () => {
    const { deps, calls } = fakeDeps();
    const out = await spawnTaskSession(deps, { root: '/p', taskId: '02', provider: 'acme', model: 'm1' });
    assert.match(out.sessionId, /^session-/);
    assert.equal(calls.create.meta.cwd, '/p');
    assert.deepEqual(calls.create.agentOptions, { provider: 'acme', model: 'm1' });
    assert.equal(calls.create.sessionId, out.sessionId);
    assert.equal(calls.followup.role, 'user');
    assert.deepEqual(calls.followup.content, [{ type: 'text', text: seedFor('02') }]);
    assert.equal(calls.flush[0], 'sess-1');
});

test('spawnTaskSession: create failure rejects for upstream per-task isolation', async () => {
    const { deps } = fakeDeps({ failCreate: true });
    await assert.rejects(() => spawnTaskSession(deps, { root: '/p', taskId: '03', provider: 'a', model: 'm' }), /agents unavailable/);
});

test('spawnTaskSession: result echoes taskId; seed override is used verbatim', async () => {
    const { deps, calls } = fakeDeps();
    const seed = seededForTask('sleep-test', '01');
    const out = await spawnTaskSession(deps, { root: '/p', taskId: '01', provider: 'acme', model: 'm1', seed });
    assert.equal(out.taskId, '01');
    assert.deepEqual(calls.followup.content, [{ type: 'text', text: seed }]);
    // ...and the qualified seed still maps back to the task id.
    const sessions = [{ id: out.sessionId, header: { cwd: '/p' }, events: [{ type: 'user/message', data: { content: calls.followup.content } }] }];
    assert.deepEqual([...mapSessionsToTasks('/p', sessions).keys()], ['01']);
});

test('spawnTaskSession: attaches the spawn to the workspace whose sessionIds contain the caller id', async () => {
    const { deps } = fakeDeps();
    // Real temp dir: accountSession mkdirs the session cwd before attaching,
    // and the fixture root starts absent so that step stays observable.
    const base = mkdtempSync(join(tmpdir(), 'kwf-ws-'));
    const root = join(base, 'project');
    try {
        const attached = [];
        deps.workspaceRegistry = {
            list: () => [
                // Decoy listed first: membership, not list order, picks the workspace.
                { path: '/elsewhere', sessionIds: ['caller-a'], attachSession: async () => { throw new Error('attached to a foreign workspace'); } },
                { path: root, sessionIds: ['caller-b'], attachSession: async (id) => { attached.push(id); } },
            ],
        };
        const out = await spawnTaskSession(deps, { root, taskId: '02', provider: 'acme', model: 'm1', callerSessionId: 'caller-b' });
        assert.deepEqual(attached, [out.sessionId]);
        assert.ok(existsSync(root)); // cwd was created before the attach attempt
    }
    finally {
        rmSync(base, { recursive: true, force: true });
    }
});

test('spawnTaskSession: caller belongs to no workspace — attachment skipped entirely (stays Ungrouped)', async () => {
    const { deps, calls } = fakeDeps();
    const createdPaths = [];
    const attachedTo = [];
    deps.workspaceRegistry = {
        list: () => [{ path: '/w', sessionIds: ['someone-else'] }],
        create(path) { createdPaths.push(path); return { attachSession: async (id) => { attachedTo.push(id); } }; },
    };
    const out = await spawnTaskSession(deps, { root: '/p', taskId: '02', provider: 'acme', model: 'm1', callerSessionId: 'unaffiliated-caller' });
    assert.match(out.sessionId, /^session-/); // spawn still succeeded
    assert.deepEqual(createdPaths, []); // no workspace invented for root
    assert.deepEqual(attachedTo, []); // nothing attached anywhere
    assert.equal(calls.flush.length, 1);
    // An ABSENT caller id (tool run outside any session, e.g. an HTTP route)
    // takes the same skip path.
    const out2 = await spawnTaskSession(deps, { root: '/p', taskId: '03', provider: 'acme', model: 'm1' });
    assert.match(out2.sessionId, /^session-/);
    assert.deepEqual(createdPaths, []);
    assert.deepEqual(attachedTo, []);
});

test('spawnTaskSession: workspace accounting failure degrades to Ungrouped (no rejection)', async () => {
    const { deps, calls } = fakeDeps();
    deps.workspaceRegistry = { list() { throw new Error('registry down'); } };
    const out = await spawnTaskSession(deps, { root: '/p', taskId: '02', provider: 'acme', model: 'm1' });
    assert.match(out.sessionId, /^session-/); // spawn still succeeded
    assert.equal(calls.flush.length, 1);
});

test('spawnTaskSession: installModelSelection routes provider/model through both handlers', async () => {
    const { deps, handlers } = fakeDeps();
    await spawnTaskSession(deps, { root: '/p', taskId: '02', provider: 'acme', model: 'm1' });
    // system-prompt/assemble injects the selection into assembled variables
    const assembled = await handlers['system-prompt/assemble']({}, {}, async () => ({ variables: { existing: 1 } }));
    assert.deepEqual(assembled.variables, { existing: 1, provider: 'acme', model: 'm1' });
    // agent/request overrides the resolved payload, dropping inherited effort
    const request = await handlers['agent/request']({}, async () => ({ provider: 'old', model: 'old', reasoningEffort: 5, other: 'kept' }));
    assert.deepEqual(request, { provider: 'acme', model: 'm1', other: 'kept' });
});

test('spawnTaskSession: no route anywhere leaves model selection uninstalled (D1 guard)', async () => {
    const { deps, handlers } = fakeDeps();
    await spawnTaskSession(deps, { root: '/p', taskId: '02' });
    // Pinning an all-undefined selection would clobber platform defaults, so
    // neither waterfall handler may be registered.
    assert.equal(handlers['system-prompt/assemble'], undefined);
    assert.equal(handlers['agent/request'], undefined);
});

// ---------- client data source (lib/index.js buildClientStateFrom, served from <root>/.wayfinder-runner/state.json) ----------
/** Build `<root>/.wayfinder-runner/state.json` in a fresh temp dir; returns root. */
function makeRegistryRoot(registry) {
    const root = mkdtempSync(join(tmpdir(), 'kwf-state-'));
    mkdirSync(join(root, '.wayfinder-runner'), { recursive: true });
    writeFileSync(join(root, '.wayfinder-runner', 'state.json'), JSON.stringify(registry));
    return root;
}

/** One registry task row with schema defaults. */
const regTask = (id, overrides = {}) => ({
    id,
    title: `task ${id}`,
    type: '',
    locator: `.scratch/main/issues/${id}-x.md`,
    blockedBy: [],
    status: 'todo',
    spawnedSessionId: null,
    ...overrides,
});

test('buildClientStateFrom: serves the registry selected map; live agents upgrade todo rows to running/waiting; done stays done', async () => {
    const index = await import('../lib/index.js');
    const repoCwd = process.cwd();
    // selectedMapId pins the OLDER map even though m-new has a greater updatedAt:
    // the route must serve selection, not recency.
    const root = makeRegistryRoot({
        version: 1,
        selectedMapId: 'm-old',
        maps: [
            {
                id: 'm-old', name: 'older', createdAt: 1, createdBySessionId: 'session-charter', updatedAt: 2,
                tasks: [
                    regTask('01', { status: 'done' }),
                    regTask('02', { title: 'In flight', type: 'task', blockedBy: ['01'] }),
                    regTask('03', { title: 'Awaiting input', type: 'task', blockedBy: ['01'] }),
                ],
            },
            {
                id: 'm-new', name: 'newer', createdAt: 5, createdBySessionId: null, updatedAt: 9,
                tasks: [regTask('01', { title: 'decoy' })],
            },
        ],
    });
    process.chdir(root);
    const cwd = process.cwd(); // capture AFTER chdir: session headers must point at the fixture root
    try {
        const seedEvent = (taskId) => ({
            type: 'user/message',
            data: { content: [{ type: 'text', text: seededForTask('older', taskId) }] },
        });
        // 01's session runs while its row says done — done must win (registry ladder first).
        // 02: running agent -> running. 03: idle agent, assistant spoke last (past a
        // lifecycle-event tail) -> waiting.
        const sessions = [
            { id: 'sess-2', header: { cwd, id: 'sess-2', title: 'Worker 02' }, events: [seedEvent('02'), { type: 'assistant/message', data: {} }] },
            { id: 'sess-3', header: { cwd, id: 'sess-3', title: 'Worker 03' }, events: [seedEvent('03'), { type: 'assistant/message', data: {} }, { type: 'agent/status-changed', data: {} }] },
            { id: 'sess-1', header: { cwd, id: 'sess-1', title: 'Worker 01' }, events: [seedEvent('01')] },
        ];
        const agents = {
            get: (id) => ({ sess1: undefined, 'sess-1': { status: 'running' }, 'sess-2': { status: 'running' }, 'sess-3': { status: 'idle' } })[id],
        };
        const state = index.buildClientStateFrom({ sessions, agents });
        assert.equal(state.kind, 'wayfinder/state');
        assert.equal(state.v, 1);
        assert.equal(state.root, cwd);
        assert.deepEqual(state.map, { name: 'older', title: 'older', createdBySessionId: 'session-charter' });
        assert.deepEqual(state.tasks.map((t) => t.id), ['01', '02', '03']);
        assert.deepEqual(state.tasks.map((t) => t.status), ['done', 'running', 'waiting']);
        const t02 = state.tasks.find((t) => t.id === '02');
        assert.equal(t02.sessionId, 'sess-2');
        assert.equal(t02.sessionTitle, 'Worker 02');
        assert.deepEqual(t02.blockedBy, ['01']);
    }
    finally {
        process.chdir(repoCwd);
        rmSync(root, { recursive: true, force: true });
    }
});

test('buildClientStateFrom: grilling flag lights for stamped live grilling rows only', async () => {
    const index = await import('../lib/index.js');
    const repoCwd = process.cwd();
    // 01: grilling + stamped -> flame lit. 02: grilling but unstamped -> no flame.
    // 03: stamped but resolved (done) -> no flame. 04: stamped, wrong type -> no flame.
    const root = makeRegistryRoot({
        version: 1,
        selectedMapId: 'm-grill',
        maps: [{
            id: 'm-grill', name: 'Grill', createdAt: 1, createdBySessionId: null, updatedAt: 2,
            tasks: [
                regTask('01', { title: 'Live batch', type: 'grilling', grillingSince: 999 }),
                regTask('02', { title: 'Unstamped', type: 'grilling' }),
                regTask('03', { title: 'Resolved grill', type: 'grilling', status: 'done', grillingSince: 500 }),
                regTask('04', { title: 'Wrong type', type: 'task', grillingSince: 700 }),
            ],
        }],
    });
    process.chdir(root);
    try {
        const state = index.buildClientStateFrom({ sessions: [], agents: undefined });
        const flags = Object.fromEntries(state.tasks.map((t) => [t.id, t.grilling]));
        assert.deepEqual(flags, { '01': true, '02': false, '03': false, '04': false });
    }
    finally {
        process.chdir(repoCwd);
        rmSync(root, { recursive: true, force: true });
    }
});

test('buildClientStateFrom: stale selectedMapId falls through selectMap to the newest open map; spawnedSessionId links without a seed match', async () => {
    const index = await import('../lib/index.js');
    const repoCwd = process.cwd();
    const root = makeRegistryRoot({
        version: 1,
        selectedMapId: 'm-gone',
        maps: [
            {
                id: 'm-stale', name: 'stale', createdAt: 1, createdBySessionId: null, updatedAt: 2,
                tasks: [regTask('01')],
            },
            {
                id: 'm-latest', name: 'latest', createdAt: 3, createdBySessionId: null, updatedAt: 9,
                tasks: [
                    regTask('01'),
                    regTask('02', { title: 'Linked by id', spawnedSessionId: 'spawned-9' }),
                ],
            },
        ],
    });
    process.chdir(root);
    const cwd = process.cwd();
    try {
        // spawned-9's first user message names NO wayfinder task: only the stored
        // spawnedSessionId can attach it to row 02.
        const sessions = [
            {
                id: 'spawned-9',
                header: { cwd, id: 'spawned-9', title: 'Resumed worker' },
                events: [{ type: 'user/message', data: { content: [{ type: 'text', text: 'what is left here?' }] } }],
            },
        ];
        const agents = { get: (id) => (id === 'spawned-9' ? { status: 'running' } : undefined) };
        const state = index.buildClientStateFrom({ sessions, agents });
        assert.equal(state.root, cwd);
        assert.deepEqual(state.map, { name: 'latest', title: 'latest', createdBySessionId: null }); // stale id ignored -> newest open wins
        const t02 = state.tasks.find((t) => t.id === '02');
        assert.equal(t02.sessionId, 'spawned-9'); // linked via spawnedSessionId, not seed
        assert.equal(t02.sessionTitle, 'Resumed worker');
        assert.equal(t02.status, 'running'); // live upgrade reaches seed-less sessions too
        assert.equal(state.tasks.find((t) => t.id === '01').status, 'todo');
    }
    finally {
        process.chdir(repoCwd);
        rmSync(root, { recursive: true, force: true });
    }
});

test('buildClientStateFrom: no registry anywhere degrades to the empty payload', async () => {
    const index = await import('../lib/index.js');
    const repoCwd = process.cwd();
    const empty = mkdtempSync(join(tmpdir(), 'kwf-empty-'));
    process.chdir(empty);
    try {
        const state = index.buildClientStateFrom({ sessions: [], agents: undefined });
        assert.equal(state.kind, 'wayfinder/state');
        assert.equal(state.v, 1);
        assert.equal(state.root, process.cwd());
        assert.equal(state.map, null);
        assert.deepEqual(state.tasks, []);
    }
    finally {
        process.chdir(repoCwd);
        rmSync(empty, { recursive: true, force: true });
    }
});

test('buildClientStateFrom: refreshes a null spawnedSessionId from the live seeded session AND persists it to state.json', async () => {
    const index = await import('../lib/index.js');
    const repoCwd = process.cwd();
    // Row 02 was created before its spawn: no spawnedSessionId, but the seeded
    // session IS live. The poll must link the payload row AND backfill the file
    // so restart restoration survives without the session list.
    const root = makeRegistryRoot({
        version: 1,
        selectedMapId: 'm-fix',
        maps: [
            {
                id: 'm-fix', name: 'Fix', createdAt: 1, createdBySessionId: null, updatedAt: 2,
                tasks: [regTask('01', { status: 'done' }), regTask('02')],
            },
        ],
    });
    process.chdir(root);
    const cwd = process.cwd();
    try {
        const sessions = [
            {
                id: 'sess-live-02',
                header: { cwd, id: 'sess-live-02', title: 'Worker 02' },
                events: [{ type: 'user/message', data: { content: [{ type: 'text', text: seededForTask('Fix', '02') }] } }],
            },
        ];
        const agents = { get: () => undefined };
        const state = index.buildClientStateFrom({ sessions, agents });
        assert.equal(state.root, cwd);
        assert.deepEqual(state.map, { name: 'Fix', title: 'Fix', createdBySessionId: null });
        const t02 = state.tasks.find((t) => t.id === '02');
        assert.equal(t02.sessionId, 'sess-live-02'); // served payload links the live session
        // persisted state.json now stores the spawnedSessionId for that row
        const stored = JSON.parse(readFileSync(join(root, '.wayfinder-runner', 'state.json'), 'utf8'));
        const storedRow = stored.maps.find((m) => m.id === 'm-fix').tasks.find((t) => t.id === '02');
        assert.equal(storedRow.spawnedSessionId, 'sess-live-02');
        assert.equal(stored.maps.find((m) => m.id === 'm-fix').tasks.find((t) => t.id === '01').spawnedSessionId, null);
    }
    finally {
        process.chdir(repoCwd);
        rmSync(root, { recursive: true, force: true });
    }
});

test('buildClientStateFrom: registry save failure during re-association is swallowed — payload still serves', async () => {
    const index = await import('../lib/index.js');
    const repoCwd = process.cwd();
    const root = makeRegistryRoot({
        version: 1,
        selectedMapId: 'm-fix',
        maps: [{ id: 'm-fix', name: 'Fix', createdAt: 1, createdBySessionId: null, updatedAt: 2, tasks: [regTask('02')] }],
    });
    process.chdir(root);
    const cwd = process.cwd();
    try {
        chmodSync(join(root, '.wayfinder-runner'), 0o555); // read-only REGISTRY dir: the temp-file rename inside saveRegistry must fail
        try {
            const sessions = [
                {
                    id: 'sess-ro',
                    header: { cwd, id: 'sess-ro', title: 'Worker RO' },
                    events: [{ type: 'user/message', data: { content: [{ type: 'text', text: seededForTask('Fix', '02') }] } }],
                },
            ];
            const state = index.buildClientStateFrom({ sessions, agents: undefined });
            const t02 = state.tasks.find((t) => t.id === '02');
            assert.equal(t02.sessionId, 'sess-ro'); // response unaffected by the failed persist
            assert.equal(t02.status, 'todo'); // agents absent -> plain todo ladder
            const stored = JSON.parse(readFileSync(join(root, '.wayfinder-runner', 'state.json'), 'utf8'));
            assert.equal(stored.maps[0].tasks[0].spawnedSessionId, null); // nothing persisted, and that's fine
        }
        finally {
            chmodSync(join(root, '.wayfinder-runner'), 0o755); // let rmSync clean up
        }
    }
    finally {
        process.chdir(repoCwd);
        rmSync(root, { recursive: true, force: true });
    }
});

// ---------- wayfinder_spawn_session against the registry (lib/index.js buildSpawnTool) ----------
import { loadRegistry } from '../lib/verbs.js';

/** Registry fixture: one map, tasks 01(done) <- 02(todo, blockedBy[01]) <- 03(todo, blockedBy[02]) plus 04(todo). */
function makeRegistryProject() {
    const root = mkdtempSync(join(tmpdir(), 'kwf-reg-'));
    mkdirSync(join(root, '.wayfinder-runner'), { recursive: true });
    const task = (id, status, blockedBy) => ({
        id,
        title: `task ${id}`,
        locator: `.scratch/main/issues/${id}-x.md`,
        blockedBy: blockedBy ?? [],
        status,
        spawnedSessionId: null,
    });
    writeFileSync(join(root, '.wayfinder-runner', 'state.json'), JSON.stringify({
        version: 1,
        selectedMapId: 'm-fix',
        maps: [{
            id: 'm-fix',
            name: 'main',
            createdAt: 1,
            createdBySessionId: null,
            updatedAt: 2,
            tasks: [task('01', 'done'), task('02', 'todo', ['01']), task('03', 'todo', ['02']), task('04', 'todo')],
        }],
    }));
    return root;
}

/** Fake deps for buildSpawnTool's spawnTaskSession calls: records seeds/routes, mints ids. */
function fakeSpawnDeps() {
    const spawned = []; // { taskId, text }
    const routes = []; // agentOptions per create call, in spawn order
    const agents = {
        async create(input) {
            routes.push(input.agentOptions);
            await input.setup({ on: () => {}, get: () => undefined });
            return {
                agent: {
                    session: input.sessionId,
                    async whenIdle() {},
                    followup(msg) {
                        const text = msg.content[0].text;
                        spawned.push({ taskId: text.match(/work on task \((\d+)\)/)[1], text });
                    },
                },
            };
        },
    };
    return {
        deps: { agents, sessions: { async flush() {} } },
        spawned,
        routes,
    };
}

/** ToolRunContext stand-in for execute(): request-header config and/or agent options carry the inherited route; header.id names the calling session. */
const execWith = ({ headerConfig, options, callerId = 'caller-9' } = {}) => ({
    agent: {
        session: {
            header: { id: callerId },
            ...(headerConfig === undefined ? {} : { requestHeader: () => ({ config: headerConfig }) }),
        },
        ...(options === undefined ? {} : { options }),
    },
});

test('spawn tool: no tasks spawns the ready frontier (02, 04), seeds carry map+locator, and persists spawnedSessionId', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        assert.equal(tool.name, 'wayfinder_spawn_session');
        const out = await tool.execute({ root });
        assert.deepEqual(out.results.map((r) => r.task), ['02', '04']); // frontier honors blockedBy+done
        assert.ok(fake.spawned.every((s) => s.text.startsWith(`/wayfinder work on task (${s.taskId}) of map (main)`)), 'seed names task + map with /wayfinder gesture');
        assert.ok(fake.spawned.every((s) => s.text.includes(`Task locator: .scratch/main/issues/${s.taskId}-x.md`)), 'seed carries the Task locator line');
        const reg = loadRegistry(root, readFile);
        const byId = new Map(reg.maps[0].tasks.map((t) => [t.id, t]));
        assert.equal(byId.get('02').spawnedSessionId, out.results[0].sessionId);
        assert.equal(byId.get('04').spawnedSessionId, out.results[1].sessionId);
        assert.equal(byId.get('01').spawnedSessionId, null);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('spawn tool: explicit tasks gate on readiness; unknown id errors in isolation', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        const blocked = await tool.execute({ root, tasks: ['03'] }); // 03 is blocked by undone 02
        assert.equal(blocked.results.length, 1);
        assert.match(blocked.results[0].error, /not ready/);
        assert.equal(fake.spawned.length, 0); // nothing was spawned
        const unknown = await tool.execute({ root, tasks: ['99'] });
        assert.match(unknown.results[0].error, /task 99.*not found/);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('spawn tool: mapId targets a non-selected map; empty frontier renders the all-settled message', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        // second map, newer updatedAt -> selectMap picks it over m-fix
        writeFileSync(join(root, '.wayfinder-runner', 'state.json'), JSON.stringify({
            version: 1,
            selectedMapId: 'm-new',
            maps: [
                {
                    id: 'm-fix', name: 'main', createdAt: 1, createdBySessionId: null, updatedAt: 2,
                    tasks: [{ id: '01', title: 't', locator: 'l', blockedBy: [], status: 'todo', spawnedSessionId: null }],
                },
                {
                    id: 'm-new', name: 'fresh', createdAt: 3, createdBySessionId: null, updatedAt: 9,
                    tasks: [{ id: '01', title: 'newer', locator: 'l2', blockedBy: [], status: 'done', spawnedSessionId: null }],
                },
            ],
        }));
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        // default selection would be m-new (closed) — mapId must reach m-fix instead
        const out = await tool.execute({ root, mapId: 'm-fix' });
        assert.deepEqual(out.results.map((r) => r.task), ['01']);
        assert.match(out.results[0].sessionId, /^session-/);
        assert.equal(loadRegistry(root, readFile).maps.find((m) => m.id === 'm-fix').tasks[0].spawnedSessionId, out.results[0].sessionId);
        // selected map stays OPEN (a non-done row exists) but its only task derives
        // blocked -> the ready frontier is empty -> results []
        writeFileSync(join(root, '.wayfinder-runner', 'state.json'), JSON.stringify({
            version: 1,
            selectedMapId: 'm-new',
            maps: [
                {
                    id: 'm-fix', name: 'main', createdAt: 1, createdBySessionId: null, updatedAt: 2,
                    tasks: [{ id: '01', title: 't', locator: 'l', blockedBy: [], status: 'done', spawnedSessionId: null }],
                },
                {
                    id: 'm-new', name: 'fresh', createdAt: 3, createdBySessionId: null, updatedAt: 9,
                    tasks: [{ id: '01', title: 'newer', locator: 'l2', blockedBy: ['ghost'], status: 'todo', spawnedSessionId: null }],
                },
            ],
        }));
        const none = await tool.execute({ root });
        assert.deepEqual(none.results, []);
        assert.match(tool.output.render({}, none)[0].text, /no ready tasks/);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('spawn tool: explicit provider/model args beat the inherited route', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        const out = await tool.execute(
            { root, tasks: ['04'], provider: 'explicit-p', model: 'explicit-m' },
            execWith({ headerConfig: { provider: 'hdr-p', model: 'hdr-m' }, options: { provider: 'opt-p', model: 'opt-m' } }),
        );
        assert.equal(out.results[0].error, undefined);
        assert.deepEqual(fake.routes.at(-1), { provider: 'explicit-p', model: 'explicit-m' });
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('spawn tool: route inherits from requestHeader().config first, agent.options second', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        // Header config alone flows through.
        await tool.execute({ root, tasks: ['04'] }, execWith({ headerConfig: { provider: 'hdr-p', model: 'hdr-m' } }));
        assert.deepEqual(fake.routes.at(-1), { provider: 'hdr-p', model: 'hdr-m' });
        // Options are the fallback when no header exists yet.
        await tool.execute({ root, tasks: ['04'] }, execWith({ options: { provider: 'opt-p', model: 'opt-m' } }));
        assert.deepEqual(fake.routes.at(-1), { provider: 'opt-p', model: 'opt-m' });
        // Both present -> the request header wins (it is what the last turn ran under).
        await tool.execute(
            { root, tasks: ['04'] },
            execWith({ headerConfig: { provider: 'hdr-p', model: 'hdr-m' }, options: { provider: 'opt-p', model: 'opt-m' } }),
        );
        assert.deepEqual(fake.routes.at(-1), { provider: 'hdr-p', model: 'hdr-m' });
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('spawn tool: empty-string overrides fall through to the inherited route (non-empty strings only)', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        await tool.execute(
            { root, tasks: ['04'], provider: '', model: '   ' },
            execWith({ headerConfig: { provider: 'hdr-p', model: 'hdr-m' } }),
        );
        assert.deepEqual(fake.routes.at(-1), { provider: 'hdr-p', model: 'hdr-m' });
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('spawn tool: no caller route and no overrides spawns with undefined provider/model (no throw)', async () => {
    const index = await import('../lib/index.js');
    const root = makeRegistryProject();
    try {
        const fake = fakeSpawnDeps();
        const tool = index.buildSpawnTool({ agents: fake.deps.agents, sessions: fake.deps.sessions, get: () => undefined });
        const out = await tool.execute({ root, tasks: ['04'] }, execWith());
        assert.match(out.results[0].sessionId, /^session-/); // spawn succeeded
        assert.deepEqual(fake.routes.at(-1), { provider: undefined, model: undefined });
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

// ---------- plugin wiring smoke (lib/index.js) ----------
test('index.apply registers tools + route + command + session-start hook', async () => {
    const index = await import('../lib/index.js');
    const registeredTools = [];
    const registeredRoutes = [];
    const registeredCommands = [];
    const sessionStartHandlers = [];
    const pluginDeps = {
        // apply() scopes one inject unit: ['webServer'] — hand a stand-in by name.
        inject: (names, fn) => fn(names.includes('webServer')
            ? { webServer: { register: (r) => registeredRoutes.push(r.path) } }
            : {}),
        tools: { register: (t) => registeredTools.push(t.name) },
        agents: {},
        sessions: { list: () => [] },
        on: (event, handler) => sessionStartHandlers.push([event, handler]),
        effect: (fn) => fn(),
        commands: { register: (c) => registeredCommands.push(c.name) },
    };
    index.apply(pluginDeps, {});
    assert.deepEqual(registeredRoutes, ['/dsh-wayfinder']);
    assert.deepEqual(registeredCommands, ['wayfinder-map-sync']);
    assert.equal(sessionStartHandlers.length, 1);
    assert.equal(sessionStartHandlers[0][0], 'agent/session-start');
    assert.deepEqual(registeredTools.sort(), ['wayfinder_grilling_start', 'wayfinder_map_create', 'wayfinder_map_sync', 'wayfinder_snippet', 'wayfinder_spawn_session', 'wayfinder_task_resolve', 'wayfinder_task_set_status']);
});

test('SEEDED_FOR_TASK: alphanumeric id + locator line after seed line', () => {
    const m = SEEDED_FOR_TASK.exec('/wayfinder work on task (4a8ytmsh) of map (my-map)\nTask locator: dex:abc');
    assert.ok(m);
    assert.equal(m[1], '4a8ytmsh');
    assert.equal(m[2], 'my-map');
});
test('SEEDED_FOR_TASK: still captures plain numeric form', () => {
    const m = SEEDED_FOR_TASK.exec('/wayfinder work on task (02) of map (sleep-test)');
    assert.ok(m);
    assert.deepEqual([m[1], m[2]], ['02', 'sleep-test']);
});
test('SEED_MESSAGE: numeric and alphanumeric ids match; map-qualified + locator text rejected; legacy seeds still match', () => {
    assert.match(seedFor('07'), SEED_MESSAGE);
    const alnum = SEED_MESSAGE.exec('/wayfinder work on task (4a8ytmsh)');
    assert.equal(alnum[1], '4a8ytmsh');
    assert.doesNotMatch('/wayfinder work on task (02) of map (sleep-test)', SEED_MESSAGE);
    const legacy = SEED_MESSAGE.exec('load wayfinder skill, work on task (4a8ytmsh)');
    assert.equal(legacy[1], '4a8ytmsh');
});

// ---------- end-to-end restart cycle: chart -> spawn -> RESTART -> cold client state ----------
import { saveRegistry } from '../lib/verbs.js';
import { renameSync as renameSyncReal } from 'node:fs';

test('restart cycle: charted+spawned registry survives a cold start — selected map served, no live upgrade without sessions, seeded session upgrades to running', async () => {
    const index = await import('../lib/index.js');
    // Real fs adapters, same shape lib/index.js hands the core.
    const readFile = (file) => readFileSync(file, 'utf8');
    const io = { writeFile: writeFileSync, rename: renameSyncReal };
    const root = mkdtempSync(join(tmpdir(), 'kwf-e2e-'));
    try {
        // 1. Chart through the public verb: two tasks, 02 blocked by 01.
        mkdirSync(join(root, '.wayfinder-runner'), { recursive: true });
        const reg = loadRegistry(root, readFile);
        const created = mapCreate(
            {
                root,
                name: 'e2e',
                tasks: [
                    { id: '01', title: 'First', locator: 'dex:e2e-01' },
                    { id: '02', title: 'Second', locator: 'jira:E2E-2', blockedBy: ['01'] },
                ],
            },
            reg,
            Date.now(),
        );
        assert.equal(created.ok, true);
        assert.equal(saveRegistry(root, reg, io), true);

        // 2. Simulate spawn: row 01 is linked to a spawned session and persisted.
        const afterSpawn = loadRegistry(root, readFile);
        afterSpawn.maps[0].tasks.find((t) => t.id === '01').spawnedSessionId = 'sess-e2e';
        saveRegistry(root, afterSpawn, io);

        // 3. RESTART SIMULATION: fresh client poll with zero sessions and no agents.
        process.chdir(root);
        const cwd = process.cwd();
        const cold = index.buildClientStateFrom({ sessions: [], agents: undefined });
        assert.equal(cold.kind, 'wayfinder/state');
        assert.deepEqual(cold.map, { name: 'e2e', title: 'e2e', createdBySessionId: null }); // selectedMapId wins
        const coldById = new Map(cold.tasks.map((t) => [t.id, t]));
        // 01 stays todo: spawnedSessionId is set but its session is not listed -> no live upgrade.
        assert.equal(coldById.get('01').status, 'todo');
        assert.equal(coldById.get('01').sessionId, 'sess-e2e'); // still linked from the file
        // 02 derives blocked from its blockedBy edge.
        assert.equal(coldById.get('02').status, 'blocked');

        // 4. Second variant: the spawned session IS live now (fake agent running).
        //    Shape mirrors the session/agent fakes used above in this file.
        const sessions = [{
            id: 'sess-e2e',
            header: { cwd, id: 'sess-e2e', title: 'Worker 01' },
            events: [{ type: 'user/message', data: { content: [{ type: 'text', text: '/wayfinder work on task (01) of map (e2e)\nTask locator: dex:e2e-01' }] } }],
        }];
        const agents = { get: (id) => (id === 'sess-e2e' ? { status: 'running' } : undefined) };
        const warm = index.buildClientStateFrom({ sessions, agents });
        assert.equal(warm.root, cwd);
        const t01 = warm.tasks.find((t) => t.id === '01');
        assert.equal(t01.status, 'running'); // live upgrade once the agent reports running
        assert.equal(t01.sessionTitle, 'Worker 01');
        assert.equal(warm.tasks.find((t) => t.id === '02').status, 'blocked');
    }
    finally {
        process.chdir(repoCwdE2E);
        rmSync(root, { recursive: true, force: true });
    }
});
