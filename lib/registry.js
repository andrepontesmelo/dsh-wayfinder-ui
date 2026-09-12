/**
 * dsh-wayfinder-ui — per-workspace registry file, schema v1.
 *
 * Consumers: the spawn tool picks its target map through selectMap(); the
 * in-session map card derives per-task enums via deriveStatus(). All
 * filesystem IO is injected so tests never need a real tree:
 *   readRegistry(file, readFile)      — readFile behaves like readFileSync
 *   writeRegistry(file, registry, io) — io.writeFile(temp, text), io.rename(from, to),
 *     optional io.unlink(path) used for best-effort temp cleanup on failure.
 *   The temp file is uniquely named per call so concurrent writers of the same
 *   registry never share a temp path; last successful rename wins.
 */

import { randomUUID } from 'node:crypto';
const STATUSES = new Set(['todo', 'done', 'running', 'waiting', 'blocked']);

/** The only registry shape callers may trust blind; everything else goes through normalizeRegistry. */
export const emptyRegistry = () => ({ version: 1, selectedMapId: null, maps: [] });

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value) => (typeof value === 'string' ? value : '');
const asTime = (value) => (Number.isFinite(value) ? value : 0);
const asIdOrNull = (value) => (typeof value === 'string' ? value : null);

/** Glossary "open map": at least one task not done. Closed maps are never shown or spawned against. */
const isOpen = (map) => (map.tasks ?? []).some((task) => task?.status !== 'done');

/** One stored task reduced to schema fields only: unknown fields dropped, status clamped, blockedBy filtered. */
function normalizeTask(raw) {
    return {
        id: asString(raw.id),
        title: asString(raw.title),
        type: asString(raw.type),
        locator: asString(raw.locator),
        blockedBy: [...new Set((Array.isArray(raw.blockedBy) ? raw.blockedBy : []).filter((id) => typeof id === 'string'))],
        status: STATUSES.has(raw.status) ? raw.status : 'todo',
        spawnedSessionId: asIdOrNull(raw.spawnedSessionId),
        // Epoch ms when the task's grilling session reported it began grilling and
        // awaits the user (0 = not currently grilling). Persisted so restart
        // restores the flame from state.json alone; cleared implicitly by resolve.
        grillingSince: asTime(raw.grillingSince),
    };
}

/** One stored map reduced to schema fields only; non-object task entries are dropped here. */
function normalizeMap(raw) {
    return {
        id: asString(raw.id),
        name: asString(raw.name),
        createdAt: asTime(raw.createdAt),
        createdBySessionId: asIdOrNull(raw.createdBySessionId),
        updatedAt: asTime(raw.updatedAt),
        tasks: (Array.isArray(raw.tasks) ? raw.tasks : []).filter(isObject).map(normalizeTask),
    };
}

/** Coerce any input into a valid v1 registry: only known fields survive, garbage becomes emptyRegistry(). */
export function normalizeRegistry(raw) {
    if (!isObject(raw))
        return emptyRegistry();
    return {
        // When bumping schema, treat raw.version > 1 as unreadable here instead of coercing,
        // or the next writeRegistry silently strips v2 fields back to v1.
        version: 1,
        selectedMapId: asIdOrNull(raw.selectedMapId),
        maps: (Array.isArray(raw.maps) ? raw.maps : []).filter(isObject).map(normalizeMap),
    };
}

/** Read the registry file via the injected reader; parse failure, missing file, or non-object all yield emptyRegistry(). Never throws. */
export function readRegistry(file, readFile) {
    try {
        const raw = JSON.parse(readFile(file));
        return isObject(raw) ? normalizeRegistry(raw) : emptyRegistry();
    }
    catch {
        return emptyRegistry();
    }
}

/** Persist atomically-ish: pretty JSON plus newline to a unique `<file>.<uuid>.tmp`, then rename over `file`. True on success, false on ANY error. Never throws. */
export function writeRegistry(file, registry, io) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        io.writeFile(temp, `${JSON.stringify(registry, null, 2)}\n`);
        io.rename(temp, file);
        return true;
    }
    catch {
        try {
            io.unlink?.(temp);
        }
        catch { /* best effort */ }
        return false;
    }
}

/**
 * Per-task status derivation (spec order):
 *   stored done -> done
 *   any blockedBy entry absent from tasksById, or whose own status is not done -> blocked
 *   else -> stored status clamped to the allowed set (default todo)
 */
export function deriveStatus(task, tasksById) {
    if (task.status === 'done')
        return 'done';
    const lookup = (id) => (tasksById instanceof Map ? tasksById.get(id) : tasksById?.[id]);
    const blocked = (task.blockedBy ?? []).some((id) => {
        const target = lookup(id);
        return target == null || target.status !== 'done';
    });
    if (blocked)
        return 'blocked';
    return STATUSES.has(task.status) ? task.status : 'todo';
}

/** The selected map by id — unless that map exists but is closed (glossary: closed maps are never shown or spawned against) — else the open map with the greatest updatedAt, else null. Equal updatedAt keeps the earlier row. */
export function selectMap(registry) {
    const maps = Array.isArray(registry?.maps) ? registry.maps : [];
    const selected = maps.find((map) => map.id === registry.selectedMapId && isOpen(map));
    if (selected !== undefined)
        return selected;
    const open = maps.filter(isOpen);
    if (open.length === 0)
        return null;
    return open.reduce((latest, map) => ((map.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? map : latest));
}
