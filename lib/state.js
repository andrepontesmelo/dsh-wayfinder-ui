/**
 * dsh-wayfinder-ui — session/seed derivation helpers.
 *
 * The registry (lib/registry.js) owns map state; this module keeps only the
 * seed-message contract shared by the spawn bootstrap (lib/session.js) and the
 * boot-time re-association in lib/index.js: build the seed for a task, and
 * match a listed session back to the task it was seeded for.
 */
import { resolve } from 'node:path';

/**
 * Seeds start with a `/wayfinder` slash gesture: tool-skill's agent/pre-step
 * listener injects the skill content for `/name` tokens in user messages —
 * the same path a human's slash invocation takes — because the wayfinder
 * skill is user-invocable only (the model-facing `skill` tool rejects it).
 * Legacy "load wayfinder skill, ..." seeds (pre-gesture spawns) still match.
 */
export const seedFor = (taskId) => `/wayfinder work on task (${taskId})`;
export const SEED_MESSAGE = /^(?:\/wayfinder |load wayfinder skill, )work on task \(([^)]+)\)$/;
/** Map-qualified seed: captures task id + map name; locator text may follow on the next line. */
export const seededForTask = (area, taskId, locator) => locator === undefined
    ? `/wayfinder work on task (${taskId}) of map (${area})`
    : `/wayfinder work on task (${taskId}) of map (${area})\nTask locator: ${locator}`;
export const SEEDED_FOR_TASK = /^(?:\/wayfinder |load wayfinder skill, )work on task \(([^)]+)\) of map \(([^)]+)\)/;

/** SessionEvent data: `user/message` data IS the UserMessage; `assistant/message` data is { turn, step, message, ... } (dsh-session/lib/types/types.d.ts:262,279). */
function firstUserText(session) {
    const event = session.events.find((entry) => entry.type === 'user/message');
    if (!event)
        return '';
    const data = event.data;
    const blocks = data && Array.isArray(data.content) ? data.content : [];
    const textBlock = blocks.find((block) => block && block.type === 'text');
    return textBlock ? String(textBlock.text) : '';
}

/** Map spawned sessions back to task ids: session.header.cwd === root AND first user/message text matches the seed. */
export function mapSessionsToTasks(root, sessions) {
    const byTask = new Map();
    for (const session of sessions) {
        if (typeof session?.header?.cwd !== 'string' || resolve(session.header.cwd) !== root)
            continue;
        // Prefer area-qualified seeds (unambiguous across maps); fall back to the bare seed.
        const text = firstUserText(session);
        const qualified = SEEDED_FOR_TASK.exec(text);
        const match = qualified ?? SEED_MESSAGE.exec(text);
        if (!match || byTask.has(match[1]))
            continue;
        byTask.set(match[1], session);
    }
    return byTask;
}
