/**
 * Tests for lib/verbs.js (registry mutation verbs) through public verb functions
 * only: pure in-memory registries, no real filesystem anywhere in this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCreate, mapSync, taskResolve, taskSetStatus, grillingStart } from '../lib/verbs.js';

const EMPTY = { version: 1, selectedMapId: null, maps: [] };

/** Fresh empty registry per test so mutations never leak between cases. */
const freshRegistry = () => structuredClone(EMPTY);

const TASKS = [
    { id: '01', title: 'Shell', type: 'task', locator: '.scratch/x/issues/01-shell.md', blockedBy: ['02'] },
    { id: '02', title: 'Card', locator: '.scratch/x/issues/02-card.md' },
];
const NOW = 1700000000000;

// ---------- mapCreate happy path ----------
test('mapCreate appends a new map with every row todo, selects it, and leaves createdBySessionId null', () => {
    const reg = freshRegistry();
    const result = mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.registry, reg); // mutates in place and returns it
    assert.equal(reg.maps.length, 1);
    const map = reg.maps[0];
    assert.equal(map.name, 'X');
    assert.match(map.id, /^m/);
    assert.equal(map.createdAt, NOW);
    assert.equal(map.updatedAt, NOW);
    assert.equal(map.createdBySessionId, null);
    assert.deepEqual(map.tasks.map((t) => t.status), ['todo', 'todo']);
    assert.deepEqual(reg.selectedMapId, map.id);
});

test('mapCreate normalizes rows: missing blockedBy becomes [], duplicate blockers dedupe, unknown type clamps to empty string', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: [{ id: '01', title: 'T', locator: '.l', blockedBy: ['02', '02'] }] }, reg, NOW);
    assert.deepEqual(reg.maps[0].tasks[0], {
        id: '01', title: 'T', type: '', locator: '.l', blockedBy: ['02'], status: 'todo', spawnedSessionId: null, grillingSince: 0,
    });
});

// ---------- mapCreate validation failures leave the registry untouched ----------
test('mapCreate rejects an empty name', () => {
    const reg = freshRegistry();
    const before = structuredClone(reg);
    const result = mapCreate({ root: '/ws', name: '', tasks: TASKS }, reg, NOW);
    assert.equal(result.ok, false);
    assert.match(result.error, /name/);
    assert.deepEqual(reg, before);
});

test('mapCreate rejects a task row missing its title', () => {
    const reg = freshRegistry();
    const before = structuredClone(reg);
    const result = mapCreate({ root: '/ws', name: 'X', tasks: [{ id: '01', locator: '.l' }] }, reg, NOW);
    assert.equal(result.ok, false);
    assert.match(result.error, /tasks\[0\]\.title/);
    assert.deepEqual(reg, before);
});

test('mapCreate rejects an empty locator', () => {
    const reg = freshRegistry();
    const before = structuredClone(reg);
    const result = mapCreate({ root: '/ws', name: 'X', tasks: [{ id: '01', title: 'T', locator: '' }] }, reg, NOW);
    assert.equal(result.ok, false);
    assert.match(result.error, /tasks\[0\]\.locator/);
    assert.deepEqual(reg, before);
});

test('mapCreate rejects a non-array blockedBy and a blockedBy containing non-strings', () => {
    const reg = freshRegistry();
    const before = structuredClone(reg);
    assert.equal(mapCreate({ root: '/ws', name: 'X', tasks: [{ id: '01', title: 'T', locator: '.l', blockedBy: '02' }] }, reg, NOW).ok, false);
    assert.deepEqual(reg, before);
    assert.equal(mapCreate({ root: '/ws', name: 'X', tasks: [{ id: '01', title: 'T', locator: '.l', blockedBy: [7] }] }, reg, NOW).ok, false);
    assert.deepEqual(reg, before);
});

// ---------- create-then-select: latest creation wins the selection ----------
test('after two mapCreates, selectedMapId points at the second map', () => {
    const reg = freshRegistry();
    const first = mapCreate({ root: '/ws', name: 'One', tasks: TASKS }, reg, NOW);
    const second = mapCreate({ root: '/ws', name: 'Two', tasks: TASKS }, reg, NOW + 1);
    assert.equal(first.ok && second.ok, true);
    assert.equal(reg.maps.length, 2);
    assert.notEqual(first.registry.maps[0].id, second.registry.maps[1].id);
    assert.equal(reg.selectedMapId, reg.maps[1].id);
});

// ---------- taskResolve ----------
test('taskResolve marks the named task done in the explicitly addressed map', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const result = taskResolve({ root: '/ws', mapId: reg.maps[0].id, taskId: '01' }, reg);
    assert.equal(result.ok, true);
    assert.equal(reg.maps[0].tasks.find((t) => t.id === '01').status, 'done');
    assert.equal(reg.maps[0].tasks.find((t) => t.id === '02').status, 'todo'); // siblings untouched
});

test('taskResolve resolves through selectedMapId when mapId is omitted', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'First', tasks: TASKS }, reg, NOW);
    mapCreate({ root: '/ws', name: 'Second', tasks: TASKS }, reg, NOW + 1);
    // selectedMapId is 'Second'; resolving '01' without a mapId must hit Second, not First
    const result = taskResolve({ root: '/ws', taskId: '01' }, reg);
    assert.equal(result.ok, true);
    assert.equal(reg.maps.find((m) => m.name === 'Second').tasks.find((t) => t.id === '01').status, 'done');
    assert.equal(reg.maps.find((m) => m.name === 'First').tasks.find((t) => t.id === '01').status, 'todo');
});

test('taskResolve with an unknown taskId fails listing that map\'s valid task ids', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const result = taskResolve({ root: '/ws', mapId: reg.maps[0].id, taskId: '99' }, reg);
    assert.equal(result.ok, false);
    assert.match(result.error, /unknown task '99' in map/);
    assert.match(result.error, /valid task ids: 01, 02/);
});

test('taskResolve with an unknown mapId fails listing the valid map ids', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const result = taskResolve({ root: '/ws', mapId: 'm-ghost', taskId: '01' }, reg);
    assert.equal(result.ok, false);
    assert.match(result.error, /unknown map 'm-ghost'/);
    assert.match(result.error, new RegExp(`valid map ids: ${reg.maps[0].id}`));
});

test('taskResolve stamps spawnedSessionId on the resolved row only, never a sibling map', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'First', tasks: TASKS }, reg, NOW);
    mapCreate({ root: '/ws', name: 'Second', tasks: TASKS }, reg, NOW + 1);
    const first = reg.maps.find((m) => m.name === 'First');
    const second = reg.maps.find((m) => m.name === 'Second');
    // Resolve the last open task of First (explicit mapId) while Second stays open:
    // the stamp must land on First's row, not on whichever map is newest-open after.
    const result = taskResolve({ root: '/ws', mapId: first.id, taskId: '01', spawnedSessionId: 'session-worker' }, reg);
    assert.equal(result.ok, true);
    assert.equal(first.tasks.find((t) => t.id === '01').spawnedSessionId, 'session-worker');
    assert.equal(second.tasks.find((t) => t.id === '01').spawnedSessionId, null);
});

test('taskResolve never overwrites an existing spawnedSessionId', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const map = reg.maps[0];
    map.tasks.find((t) => t.id === '01').spawnedSessionId = 'original';
    const result = taskResolve({ root: '/ws', mapId: map.id, taskId: '01', spawnedSessionId: 'imposter' }, reg);
    assert.equal(result.ok, true);
    assert.equal(map.tasks.find((t) => t.id === '01').spawnedSessionId, 'original');
});

test('taskResolve without mapId on the selected map\'s last open task still reports that map and stamps it', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'Only', tasks: [{ id: '01', title: 'T', locator: '.l' }] }, reg, NOW);
    const mapId = reg.maps[0].id;
    // Closing the only open map must not detach the report from the touched map
    // (the old re-derivation returned null / another map here).
    const result = taskResolve({ root: '/ws', taskId: '01', spawnedSessionId: 'session-worker' }, reg);
    assert.equal(result.ok, true);
    assert.equal(result.map.id, mapId);
    assert.equal(result.map.tasks[0].status, 'done');
    assert.equal(result.map.tasks[0].spawnedSessionId, 'session-worker');
});

// ---------- taskSetStatus ----------
test('taskSetStatus overrides any status and accepts each valid status', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const mapId = reg.maps[0].id;
    for (const status of ['running', 'waiting', 'blocked', 'done', 'todo']) {
        const result = taskSetStatus({ root: '/ws', mapId, taskId: '02', status }, reg);
        assert.equal(result.ok, true, status);
        assert.equal(reg.maps[0].tasks.find((t) => t.id === '02').status, status);
    }
});

test('taskSetStatus rejects invalid statuses without touching the task', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const before = structuredClone(reg);
    for (const status of ['finished', '', undefined, 'TODO']) {
        const result = taskSetStatus({ root: '/ws', mapId: reg.maps[0].id, taskId: '01', status }, reg);
        assert.equal(result.ok, false);
        assert.match(result.error, /valid statuses: todo\|done\|running\|waiting\|blocked/);
    }
    assert.deepEqual(reg, before);
});

test('taskSetStatus reports unknown taskId/mapId through the shared resolver', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    assert.match(taskSetStatus({ root: '/ws', mapId: 'm-nope', taskId: '01', status: 'done' }, reg).error, /unknown map/);
    assert.match(taskSetStatus({ root: '/ws', taskId: 'nope', status: 'done' }, reg).error, /unknown task 'nope'/);
});

// ---------- mapSync: replace-or-create recovery hatch ----------
test('mapSync on an existing name replaces tasks in place without growing maps (idempotent)', () => {
    const reg = freshRegistry();
    mapSync({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW);
    const original = reg.maps[0];
    const firstSync = mapSync({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW + 5);
    const secondSync = mapSync({ root: '/ws', name: 'X', tasks: TASKS }, reg, NOW + 10);
    assert.equal(firstSync.ok && secondSync.ok, true);
    assert.equal(reg.maps.length, 1); // no growth across repeated syncs
    assert.equal(reg.maps[0], original); // same row object: id/createdAt preserved
    assert.equal(original.id, reg.maps[0].id);
    assert.equal(original.createdAt, NOW);
    assert.equal(original.updatedAt, NOW + 10);
    assert.equal(reg.maps[0].tasks.length, TASKS.length); // replaced, not appended
    assert.equal(reg.selectedMapId, original.id); // selection untouched by syncs
});

test('mapSync on an unknown name creates a fresh map like mapCreate', () => {
    const reg = freshRegistry();
    const result = mapSync({ root: '/ws', name: 'Brand-new', tasks: TASKS }, reg, NOW);
    assert.equal(result.ok, true);
    assert.equal(reg.maps.length, 1);
    assert.equal(reg.maps[0].name, 'Brand-new');
    assert.equal(reg.selectedMapId, reg.maps[0].id);
    assert.deepEqual(reg.maps[0].tasks.map((t) => t.status), ['todo', 'todo']);
});

// ---------- grillingStart verb ----------
test('grillingStart stamps grillingSince and links reporting session on the task row', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'M', tasks: [{ id: '01', title: 'G', type: 'grilling', locator: '.l' }] }, reg, NOW);
    const result = grillingStart({ root: '/ws', taskId: '01', sessionId: 'sess-grill' }, reg, NOW + 100);
    assert.equal(result.ok, true);
    assert.equal(reg.maps[0].tasks[0].grillingSince, NOW + 100);
    assert.equal(reg.maps[0].tasks[0].spawnedSessionId, 'sess-grill');
});

test('grillingStart rejects unknown map/task with actionable error', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'M', tasks: [{ id: '01', title: 'G', type: 'grilling', locator: '.l' }] }, reg, NOW);
    const resBadTask = grillingStart({ root: '/ws', taskId: '99', sessionId: 's' }, reg, NOW);
    assert.equal(resBadTask.ok, false);
    assert.match(resBadTask.error, /unknown task '99'/);
    const resBadMap = grillingStart({ root: '/ws', mapId: 'm-ghost', taskId: '01', sessionId: 's' }, reg, NOW);
    assert.equal(resBadMap.ok, false);
    assert.match(resBadMap.error, /unknown map 'm-ghost'/);
});

test('taskResolve clears grillingSince when marking task done', () => {
    const reg = freshRegistry();
    mapCreate({ root: '/ws', name: 'M', tasks: [{ id: '01', title: 'G', type: 'grilling', locator: '.l' }] }, reg, NOW);
    grillingStart({ root: '/ws', taskId: '01', sessionId: 's' }, reg, NOW + 50);
    assert.equal(reg.maps[0].tasks[0].grillingSince, NOW + 50);
    taskResolve({ root: '/ws', taskId: '01' }, reg);
    assert.equal(reg.maps[0].tasks[0].status, 'done');
    assert.equal(reg.maps[0].tasks[0].grillingSince, 0);
});
