/**
 * dsh-wayfinder-ui — registry mutation verbs (task-tracker-agnostic plugin core).
 *
 * The registry lives at `<root>/.wayfinder-runner/state.json`; storage goes through
 * lib/registry.js exports only (readRegistry/writeRegistry/selectMap) — nothing here
 * re-implements IO or normalization beyond what those exports cover. All mutating
 * verbs (mapCreate/mapSync/taskResolve/taskSetStatus) mutate the passed registry IN PLACE and return it.
 *
 * Filesystem access is injected so tests never need a real tree:
 *   loadRegistry(root, readFile)      — readFile behaves like readFileSync
 *   saveRegistry(root, registry, io)  — io.writeFile(temp, text), io.rename(from, to)
 */

import { join } from 'node:path';
import { readRegistry, writeRegistry, selectMap } from './registry.js';

const STATUSES = ['todo', 'done', 'running', 'waiting', 'blocked'];

export const registryPath = (root) => join(root, '.wayfinder-runner', 'state.json');
export const loadRegistry = (root, readFile) => readRegistry(registryPath(root), readFile);
export const saveRegistry = (root, registry, io) => writeRegistry(registryPath(root), registry, io);

/** Map row id: 'm' + base36 timestamp + 2 random base36 chars. */
const newMapId = (nowMs) => `m${nowMs.toString(36)}${Math.floor(Math.random() * 36).toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;

/**
 * Validate a verb's task list against schema v1 (normalizeTask in lib/registry.js is not
 * exported, so validation/clamping is local): string id (non-empty), string title, optional
 * string type, non-empty string locator, optional array of string blockedBy.
 * Returns an actionable error naming the offending index, or null.
 */
function validateTasks(tasks) {
    if (!Array.isArray(tasks))
        return 'tasks must be an array';
    for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index];
        const where = `tasks[${index}]`;
        if (typeof task !== 'object' || task === null || Array.isArray(task))
            return `${where} must be an object`;
        if (typeof task.id !== 'string' || task.id === '')
            return `${where}.id must be a non-empty string`;
        if (typeof task.title !== 'string')
            return `${where}.title must be a string`;
        if (task.type !== undefined && typeof task.type !== 'string')
            return `${where}.type must be a string`;
        if (typeof task.locator !== 'string' || task.locator === '')
            return `${where}.locator must be a non-empty string`;
        if (task.blockedBy !== undefined && (!Array.isArray(task.blockedBy) || task.blockedBy.some((id) => typeof id !== 'string')))
            return `${where}.blockedBy must be an array of strings`;
    }
    return null;
}

/** Validated task input reduced to stored schema v1 fields (mirrors normalizeTask clamping; fresh rows start todo/unspawned/ungrilled). */
const normalizeTaskRow = (task) => ({
    id: task.id,
    title: task.title,
    type: typeof task.type === 'string' ? task.type : '',
    locator: task.locator,
    blockedBy: [...new Set(task.blockedBy ?? [])],
    status: 'todo',
    spawnedSessionId: null,
    grillingSince: 0,
});

/** Resolve the target map: explicit mapId wins; else selectMap() (selected open map, else greatest-updatedAt open map). */
function resolveMap(reg, mapId) {
    const maps = Array.isArray(reg?.maps) ? reg.maps : [];
    const validIds = () => maps.map((map) => map.id).join(', ') || 'none';
    if (mapId != null && mapId !== '') {
        const map = maps.find((entry) => entry.id === mapId);
        if (map)
            return { map };
        return { error: `unknown map '${mapId}' (valid map ids: ${validIds()})` };
    }
    const map = selectMap(reg);
    if (!map)
        return { error: `no open map available (valid map ids: ${validIds()})` };
    return { map };
}

/** Resolve map then task within it; unknown task names the map and its valid task ids. */
function resolveTask(reg, mapId, taskId) {
    const target = resolveMap(reg, mapId);
    if (target.error)
        return target;
    const task = target.map.tasks.find((entry) => entry.id === taskId);
    if (!task) {
        const validIds = target.map.tasks.map((entry) => entry.id).join(', ') || 'none';
        return { error: `unknown task '${taskId}' in map '${target.map.id}' (valid task ids: ${validIds})` };
    }
    return { map: target.map, task };
}

/**
 * Create a new map from validated tasks, append it, and select it. Mutates `reg` in place.
 * On validation failure returns { ok:false, error } without touching `reg`.
 */
export function mapCreate({ root, name, tasks }, reg, nowMs) {
    if (typeof name !== 'string' || name === '')
        return { ok: false, error: 'name must be a non-empty string' };
    const invalid = validateTasks(tasks);
    if (invalid)
        return { ok: false, error: invalid };
    const map = {
        id: newMapId(nowMs),
        name,
        createdAt: nowMs,
        createdBySessionId: null,
        updatedAt: nowMs,
        tasks: tasks.map(normalizeTaskRow),
    };
    reg.maps.push(map);
    reg.selectedMapId = map.id;
    return { ok: true, registry: reg, map };
}

/**
 * Recovery hatch: if a map with this name exists, replace its task list in place
 * (keep id/createdAt, bump updatedAt, selectedMapId untouched); else create like mapCreate.
 * Mutates `reg` in place.
 */
export function mapSync({ root, name, tasks }, reg, nowMs) {
    const existing = Array.isArray(reg.maps) ? reg.maps.find((map) => map.name === name) : undefined;
    if (!existing)
        return mapCreate({ root, name, tasks }, reg, nowMs);
    const invalid = validateTasks(tasks);
    if (invalid)
        return { ok: false, error: invalid };
    existing.tasks = tasks.map(normalizeTaskRow);
    existing.updatedAt = nowMs;
    return { ok: true, registry: reg, map: existing };
}

/** Mark one task done in the resolved map, stamping spawnedSessionId on the same row (once resolved, never re-resolved) and clearing any live grilling batch stamp — resolve is the flame-off path. Mutates `reg` in place. Unknown map/task -> actionable error. */
export function taskResolve({ root, mapId, taskId, spawnedSessionId }, reg) {
    const target = resolveTask(reg, mapId, taskId);
    if (target.error)
        return { ok: false, error: target.error };
    target.task.status = 'done';
    target.task.grillingSince = 0;
    if (spawnedSessionId != null && target.task.spawnedSessionId == null)
        target.task.spawnedSessionId = spawnedSessionId;
    return { ok: true, registry: reg, map: target.map };
}

/** Set one task's status in the resolved map. Mutates `reg` in place. Status must be one of todo|done|running|waiting|blocked. */
export function taskSetStatus({ root, mapId, taskId, status }, reg) {
    if (!STATUSES.includes(status))
        return { ok: false, error: `unknown status '${status}' (valid statuses: ${STATUSES.join('|')})` };
    const target = resolveTask(reg, mapId, taskId);
    if (target.error)
        return { ok: false, error: target.error };
    target.task.status = status;
    return { ok: true, registry: reg, map: target.map };
}

/**
 * Mark a task's grilling session as live: stamp grillingSince (epoch ms) and
 * link the reporting session onto the row (first report wins on the link, like
 * taskResolve). A grilling session calls this via wayfinder_grilling_start once
 * it begins grilling and awaits the user. Resolve clears the flame implicitly
 * (status done suppresses it); re-reporting restamps. Mutates `reg` in place.
 */
export function grillingStart({ root, mapId, taskId, sessionId }, reg, nowMs) {
    const target = resolveTask(reg, mapId, taskId);
    if (target.error)
        return { ok: false, error: target.error };
    target.task.grillingSince = nowMs;
    if (sessionId != null && target.task.spawnedSessionId == null)
        target.task.spawnedSessionId = sessionId;
    return { ok: true, registry: reg, map: target.map };
}
