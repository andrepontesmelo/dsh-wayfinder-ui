/**
 * Tests for lib/registry.js (schema v1 persistence + deriveStatus) through
 * injected IO only: no real filesystem anywhere in this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRegistry, writeRegistry, deriveStatus, emptyRegistry, selectMap } from '../lib/registry.js';

/** In-memory io double: captures temp+rename calls; either step can be made to fail. */
function fakeIo({ failWrite = false, failRename = false } = {}) {
    const calls = { writes: [], renames: [], unlinks: [] };
    return {
        calls,
        writeFile(path, text) {
            calls.writes.push([path, text]);
            if (failWrite)
                throw new Error('EACCES: no permission');
        },
        rename(from, to) {
            calls.renames.push([from, to]);
            if (failRename)
                throw new Error('EPERM: rename refused');
        },
        unlink(path) {
            calls.unlinks.push(path);
        },
    };
}

const EMPTY = { version: 1, selectedMapId: null, maps: [] };

const REGISTRY = {
    version: 1,
    selectedMapId: 'ui-trio',
    maps: [
        {
            id: 'ui-trio',
            name: 'UI trio',
            createdAt: 1700000000000,
            createdBySessionId: 'session-parent',
            updatedAt: 1700000005000,
            tasks: [
                { id: '01', title: 'Shell', type: 'task', locator: '.scratch/ui-trio/issues/01-shell.md', blockedBy: [], status: 'done', spawnedSessionId: 'session-1', grillingSince: 0 },
                { id: '02', title: 'Card', type: 'research', locator: '.scratch/ui-trio/issues/02-card.md', blockedBy: ['01'], status: 'running', spawnedSessionId: null, grillingSince: 0 },
                { id: '03', title: 'Wire', type: 'prototype', locator: '.scratch/ui-trio/issues/03-wire.md', blockedBy: ['01', '02'], status: 'todo', spawnedSessionId: 'session-3', grillingSince: 0 },
            ],
        },
    ],
};

// ---------- roundtrip through the atomic-write protocol ----------
test('writeRegistry then readRegistry round-trips a populated v1 registry through the fake io', () => {
    const io = fakeIo();
    assert.equal(writeRegistry('/ws/registry.json', REGISTRY, io), true);
    // pretty JSON plus trailing newline, exactly one temp write + one rename
    assert.equal(io.calls.writes.length, 1);
    assert.match(io.calls.writes[0][1], /\n$/);
    assert.deepEqual(JSON.parse(io.calls.writes[0][1]), REGISTRY);
    const reread = readRegistry('/ws/registry.json', () => io.calls.writes[0][1]);
    assert.deepEqual(reread, REGISTRY);
});

// ---------- corrupt / absent file -> emptyRegistry ----------
test('readRegistry returns an empty registry for unparseable text', () => {
    const r = readRegistry('/ws/registry.json', () => 'not json{');
    assert.deepEqual(r, EMPTY);
    assert.equal(r.version, 1);
    assert.equal(r.selectedMapId, null);
    assert.deepEqual(r.maps, []);
});

test('readRegistry swallows a throwing reader (missing file) into an empty registry', () => {
    const r = readRegistry('/ws/nope.json', () => { throw new Error('ENOENT'); });
    assert.deepEqual(r, emptyRegistry());
});

// ---------- atomic-write behavior: tmp path, rename order, failure booleans ----------
test('writeRegistry writes a unique <file>.<uuid>.tmp per call then renames it over the target', () => {
    const io = fakeIo();
    writeRegistry('/ws/deep/registry.json', REGISTRY, io);
    const [temp] = io.calls.writes[0];
    assert.match(temp, /^\/ws\/deep\/registry\.json\.[0-9a-f-]{36}\.tmp$/);
    assert.deepEqual(io.calls.renames, [[temp, '/ws/deep/registry.json']]);
    // two writers of the same file never share a temp path
    writeRegistry('/ws/deep/registry.json', REGISTRY, io);
    assert.notEqual(io.calls.writes[1][0], temp);
});

test('writeRegistry best-effort unlinks the temp when writeFile or rename throws', () => {
    const failWrite = fakeIo({ failWrite: true });
    assert.equal(writeRegistry('/ws/r.json', REGISTRY, failWrite), false);
    const failRename = fakeIo({ failRename: true });
    assert.equal(writeRegistry('/ws/r.json', REGISTRY, failRename), false);
    const temps = [...failWrite.calls.unlinks, ...failRename.calls.unlinks];
    assert.equal(temps.length, 2);
    assert.ok(temps.every((t) => t.startsWith('/ws/r.json.') && t.endsWith('.tmp')));
});

test('writeRegistry tolerates an io without unlink (older doubles keep working)', () => {
    assert.equal(writeRegistry('/ws/r.json', REGISTRY, { writeFile() { throw new Error('EACCES'); }, rename() {} }), false);
});

test('writeRegistry returns false when writeFile or rename throws (and never propagates)', () => {
    assert.equal(writeRegistry('/ws/r.json', REGISTRY, fakeIo({ failWrite: true })), false);
    assert.equal(writeRegistry('/ws/r.json', REGISTRY, fakeIo({ failRename: true })), false);
});

// ---------- deriveStatus fixtures ----------
const byIdOf = (tasks) => new Map(tasks.map((t) => [t.id, t]));

test('deriveStatus: stored done wins even with unresolved blockers', () => {
    const tasks = [
        { id: '02', status: 'done', blockedBy: ['01'] },
    ];
    assert.equal(deriveStatus(tasks[0], byIdOf(tasks)), 'done');
});

test('deriveStatus: missing blocker row blocks', () => {
    const task = { id: '03', status: 'todo', blockedBy: ['99'] };
    assert.equal(deriveStatus(task, byIdOf([task])), 'blocked');
});

test('deriveStatus: present-but-not-done blocker blocks', () => {
    const tasks = [
        { id: '01', status: 'running', blockedBy: [] },
        { id: '02', status: 'todo', blockedBy: ['01'] },
    ];
    assert.equal(deriveStatus(tasks[1], byIdOf(tasks)), 'blocked');
});

test('deriveStatus: clean todo task with all blockers done stays todo', () => {
    const tasks = [
        { id: '01', status: 'done', blockedBy: [] },
        { id: '02', status: 'todo', blockedBy: ['01'] },
    ];
    assert.equal(deriveStatus(tasks[1], byIdOf(tasks)), 'todo');
});

test('deriveStatus: self-blocked task resolves to blocked instead of hanging', () => {
    const task = { id: '01', status: 'waiting', blockedBy: ['01'] };
    assert.equal(deriveStatus(task, byIdOf([task])), 'blocked');
});

test('deriveStatus: manual override statuses pass through untouched when unblocked', () => {
    const byId = byIdOf([{ id: '01', status: 'running', blockedBy: [] }]);
    assert.equal(deriveStatus({ id: '01', status: 'running', blockedBy: [] }, byId), 'running');
    assert.equal(deriveStatus({ id: '01', status: 'waiting', blockedBy: [] }, byId), 'waiting');
    assert.equal(deriveStatus({ id: '01', status: 'blocked', blockedBy: [] }, byId), 'blocked');
});

test('deriveStatus: a null blocker row blocks instead of throwing', () => {
    assert.equal(deriveStatus({ id: '02', status: 'todo', blockedBy: ['x'] }, new Map([['x', null]])), 'blocked');
});

// ---------- normalizeRegistry via readRegistry: garbage in, v1 out ----------
const readRaw = (raw) => readRegistry('/ws/registry.json', () => JSON.stringify(raw));

test('normalize: unknown status strings clamp to todo; junk blockedBy entries are dropped', () => {
    const r = readRaw({
        version: 1,
        selectedMapId: 'main',
        maps: [{
            id: 'main',
            name: 'Main',
            createdAt: 1,
            createdBySessionId: 's',
            updatedAt: 2,
            tasks: [
                { id: '01', status: 'finished', blockedBy: [] },
                { id: '02', status: 42, blockedBy: ['01', 7, null, {}, '03'] },
            ],
        }],
    });
    assert.equal(r.version, 1); // schema version is pinned regardless of input
    assert.deepEqual(r.maps[0].tasks.map((t) => t.status), ['todo', 'todo']);
    assert.deepEqual(r.maps[0].tasks[1].blockedBy, ['01', '03']);
});

test('normalize: duplicate blocker ids are deduped', () => {
    const r = readRaw({ maps: [{ id: 'a', tasks: [{ id: '01', status: 'todo', blockedBy: ['b', 'b'] }] }] });
    assert.deepEqual(r.maps[0].tasks[0].blockedBy, ['b']);
});

test('normalize: empty-string ids are kept as-is (pinned behavior)', () => {
    const r = readRaw({ maps: [{ id: '', tasks: [{ id: '', title: 'anon' }, {}] }] });
    assert.deepEqual(r.maps.map((m) => m.id), ['']);
    assert.deepEqual(r.maps[0].tasks.map((t) => t.id), ['', '']);
});

test('normalize: non-object map entries are dropped, non-object raw yields the empty registry', () => {
    const r = readRaw({ maps: [{ id: 'a', tasks: [] }, 'junk', 42] });
    assert.deepEqual(r.maps.map((m) => m.id), ['a']);
    assert.deepEqual(readRaw(null), EMPTY);
});

test('deriveStatus: plain-object lookup (no Map) also resolves blockers', () => {
    const tasks = [
        { id: '01', status: 'running', blockedBy: [] },
        { id: '02', status: 'todo', blockedBy: ['01'] },
    ];
    assert.equal(deriveStatus(tasks[1], Object.fromEntries(tasks.map((t) => [t.id, t]))), 'blocked');
});

// ---------- selectMap ----------
const mapOf = (id, updatedAt, statuses) => ({
    id,
    name: id,
    createdAt: 0,
    createdBySessionId: null,
    updatedAt,
    tasks: statuses.map((status) => ({ id: status, status, blockedBy: [] })),
});
const CLOSED = { version: 1, selectedMapId: null, maps: [{ ...mapOf('done', 5, ['done']) }] };

test('selectMap returns selectedMapId when that map is open, ignoring newer maps', () => {
    const registry = {
        version: 1,
        selectedMapId: 'old',
        maps: [mapOf('old', 1, ['done', 'todo']), mapOf('new', 9, ['done', 'running'])],
    };
    assert.equal(selectMap(registry).id, 'old');
});

test('selectMap falls back to the newest open map when the selected id does not exist', () => {
    const registry = { version: 1, selectedMapId: 'ghost', maps: [mapOf('old', 1, ['todo']), mapOf('new', 9, ['running'])] };
    assert.equal(selectMap(registry).id, 'new');
});

test('selectMap ignores a selected-but-closed map and falls back to the newest open one', () => {
    const registry = { version: 1, selectedMapId: 'done', maps: [mapOf('done', 9, ['done']), mapOf('open', 1, ['todo'])] };
    assert.equal(selectMap(registry).id, 'open');
});

test('selectMap with equal updatedAt keeps the earlier row (file-order stable)', () => {
    const registry = { version: 1, selectedMapId: null, maps: [mapOf('first', 7, ['todo']), mapOf('second', 7, ['todo'])] };
    assert.equal(selectMap(registry).id, 'first');
});

test('selectMap with no open maps returns null', () => {
    assert.equal(selectMap(CLOSED), null);
    assert.equal(selectMap({ version: 1, selectedMapId: null, maps: [] }), null);
});
