/**
 * dsh-wayfinder-ui — session-start injection decision.
 *
 * Teaches every NEW top-level DSH session the fixed three-verb registration
 * contract (map_create / task_resolve / map_sync). Consumers: plugin entry
 * wiring (lib/index.js calls injectionText on session startup and injects the
 * result) and the tests under test/.
 */
/** Identity of the injected block, so the entry wiring can dedupe/tag it. */
export const WAYFINDER_INJECTION_SOURCE = { kind: 'plugin', plugin: 'dsh-wayfinder-ui', form: 'instructions' };

/** The fixed registration contract, seeded verbatim into new top-level sessions. */
export const WAYFINDER_CONTRACT = 'Wayfinder contract: wayfinder_map_create {root, name, tasks:[{id,title,type?,locator,blockedBy?}]}; wayfinder_task_resolve {root, taskId}; wayfinder_map_sync {root, name, tasks}.';

/**
 * Decide the injected text for a starting session.
 * Returns WAYFINDER_CONTRACT only for fresh top-level startups; null (no-op)
 * when: not startup source, no cwd, delegated session (delegationDepth > 0),
 * or subagent session (origin "subagent") — subagents get their seed message,
 * not the cold-start contract.
 */
export function injectionText(header, source = 'startup') {
    if (source !== 'startup')
        return null; // seed only NEW sessions
    if (typeof header?.cwd !== 'string' || header.cwd === '')
        return null;
    // Subagents get delegated tasks, not workspace cold-start context — skip cheaply via header.
    if ((header.delegationDepth ?? 0) !== 0)
        return null;
    if (header.origin === 'subagent')
        return null;
    return WAYFINDER_CONTRACT;
}
