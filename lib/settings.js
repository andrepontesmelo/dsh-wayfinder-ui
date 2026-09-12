/**
 * dsh-wayfinder-ui — pure UI-settings core (ticket 02).
 *
 * Four booleans persisted under one localStorage key; absent/partial/corrupt
 * values fall back to the defaults (rightPanel off: no rail and no launcher;
 * autoShowPanel off). Pure functions so node --test covers the exact
 * semantics the client bundle uses.
 *
 * TWIN WARNING: lib/client.js re-implements parseSettings/serializeSettings
 * verbatim inside its ModuleLoader bundle (it cannot import files). Keep both
 * copies byte-for-byte equivalent in behavior.
 */
export const SETTINGS_KEY = 'dsh-wayfinder-runner.ui';
export const DEFAULT_UI_SETTINGS = { rightPanel: false, sessionHighlight: true, inSessionPanel: true, autoShowPanel: false };

/**
 * Merge stored JSON into the defaults. Tolerant of null, non-JSON garbage,
 * non-object JSON, and wrong-typed/extra fields: anything that is not a
 * boolean is replaced by its default.
 */
export function parseSettings(rawStringOrNull) {
    const settings = { ...DEFAULT_UI_SETTINGS };
    let parsed;
    try {
        parsed = rawStringOrNull === null ? undefined : JSON.parse(rawStringOrNull);
    }
    catch {
        return settings;
    }
    if (!parsed || typeof parsed !== 'object')
        return settings;
    for (const key of Object.keys(DEFAULT_UI_SETTINGS))
        if (typeof parsed[key] === 'boolean')
            settings[key] = parsed[key];
    return settings;
}

/** Inverse of parseSettings: exactly the four booleans as compact JSON. */
export function serializeSettings(settings) {
    return JSON.stringify({
        rightPanel: settings.rightPanel === true,
        sessionHighlight: settings.sessionHighlight === true,
        inSessionPanel: settings.inSessionPanel === true,
        autoShowPanel: settings.autoShowPanel === true,
    });
}
