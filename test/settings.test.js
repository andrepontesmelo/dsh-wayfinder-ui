/**
 * Tests for the pure UI-settings core (lib/settings.js) — ticket 02.
 * The client bundle (lib/client.js) re-implements these functions verbatim
 * (TWIN comment); these tests pin the shared semantics.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SETTINGS_KEY, DEFAULT_UI_SETTINGS, parseSettings, serializeSettings } from '../lib/settings.js';

test('key and defaults', () => {
    assert.equal(SETTINGS_KEY, 'dsh-wayfinder-runner.ui');
    assert.deepEqual(DEFAULT_UI_SETTINGS, { rightPanel: false, sessionHighlight: true, inSessionPanel: true, autoShowPanel: false });
});

test('parseSettings: null, garbage, non-object JSON all fall back to defaults', () => {
    for (const raw of [null, 'not json at all', '{"kind":"wayfinder/map"', '42', '"str"', 'null', 'true', '[]']) {
        assert.deepEqual(parseSettings(raw), DEFAULT_UI_SETTINGS);
        // ...and defaults are fresh objects, not shared mutable state
        assert.notEqual(parseSettings(raw), DEFAULT_UI_SETTINGS);
    }
});

test('parseSettings: stored booleans override; wrong-typed fields fall back per key', () => {
    assert.deepEqual(
        parseSettings('{"rightPanel":false,"sessionHighlight":false,"inSessionPanel":false,"autoShowPanel":false}'),
        { rightPanel: false, sessionHighlight: false, inSessionPanel: false, autoShowPanel: false },
    );
    assert.deepEqual(
        parseSettings('{"rightPanel":false,"sessionHighlight":"yes","inSessionPanel":1,"bogus":"kept-out"}'),
        { rightPanel: false, sessionHighlight: true, inSessionPanel: true, autoShowPanel: false },
    );
});

test('parseSettings tolerates partial objects (absent keys stay default)', () => {
    assert.deepEqual(parseSettings('{}'), DEFAULT_UI_SETTINGS);
    assert.deepEqual(parseSettings('{"inSessionPanel":false}'), { rightPanel: false, sessionHighlight: true, inSessionPanel: false, autoShowPanel: false });
});

test('serializeSettings round-trips through parseSettings', () => {
    const settings = { rightPanel: false, sessionHighlight: true, inSessionPanel: false, autoShowPanel: false };
    assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
});

test('serializeSettings coerces missing fields to false (explicit off, not default-on)', () => {
    const raw = serializeSettings({ rightPanel: true });
    assert.equal(raw, '{"rightPanel":true,"sessionHighlight":false,"inSessionPanel":false,"autoShowPanel":false}');
    assert.deepEqual(parseSettings(raw).rightPanel, true);
});

test('parseSettings(undefined) falls back to defaults (getItem miss passed through)', () => {
    assert.deepEqual(parseSettings(undefined), DEFAULT_UI_SETTINGS);
});

// ---------- ticket 03: rail ordering (pure orderTasks extracted from lib/client.js) ----------

function extractOrderTasks() {
    const dir = mkdtempSync(join(tmpdir(), 'kwf-rail-'));
    const file = join(dir, 'rail.mjs');
    const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
    const start = src.indexOf('const RAIL_ORDER');
    const end = src.indexOf('function WayfinderRailItem');
    assert.ok(start > 0 && end > start, 'orderTasks block markers not found in lib/client.js');
    writeFileSync(file, src.slice(start, end) + '\nexport { orderTasks };\n');
    return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('orderTasks: running first … done last; stable within a status; unknown statuses sink', async () => {
    const { file, cleanup } = extractOrderTasks();
    try {
        const { orderTasks } = await import(pathToFileURL(file).href);
        const tasks = [
            { id: 'a', status: 'done' },
            { id: 'b', status: 'todo' },
            { id: 'c', status: 'blocked' },
            { id: 'd', status: 'running' },
            { id: 'e', status: 'waiting' },
            { id: 'f', status: 'weird' },
        ];
        assert.deepEqual(orderTasks(tasks).map((t) => t.id), ['d', 'e', 'c', 'b', 'a', 'f']);
        // stable within a status
        const same = [{ id: 'x', status: 'todo' }, { id: 'y', status: 'todo' }, { id: 'z', status: 'todo' }];
        assert.deepEqual(orderTasks(same).map((t) => t.id), ['x', 'y', 'z']);
        // does not mutate input
        assert.deepEqual(tasks.map((t) => t.id), ['a', 'b', 'c', 'd', 'e', 'f']);
    } finally {
        cleanup();
    }
});

// ---------- client.js poll cadence ----------
// The rail poll step (formerly marker-sliced railPollStep/railState here) now
// lives as createPollCore + the module-level pollCore in lib/client.js,
// exercised through exports.__test in test/client.test.js (fake fetch/timers).

// ---------- client.js TWIN parity (the bundle cannot import lib/settings.js) ----------
/**
 * Extract the twin settings block from lib/client.js so both the runtime
 * behavior and the literal source can be compared against lib/settings.js.
 * Any semantic drift between the twins fails here.
 */
function extractClientTwinSource() {
    const dir = mkdtempSync(join(tmpdir(), 'kwf-twin-'));
    const file = join(dir, 'twin.mjs');
    const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
    const start = src.indexOf('const SETTINGS_KEY');
    const end = src.indexOf('function useWayfinderUiSettings');
    assert.ok(start > 0 && end > start, 'twin block markers not found in lib/client.js');
    writeFileSync(file, src.slice(start, end) + '\nexport { SETTINGS_KEY, DEFAULT_UI_SETTINGS, parseSettings, serializeSettings };\n');
    return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('client.js twin block is source-identical to lib/settings.js semantics', async () => {
    const { file, cleanup } = extractClientTwinSource();
    try {
        const twin = await import(pathToFileURL(file).href);
        // behavioral parity on representative inputs...
        for (const raw of [null, undefined, 'garbage', '{"rightPanel":false}', '{}', '[1]']) {
            const expected = raw === undefined ? DEFAULT_UI_SETTINGS : parseSettings(raw);
            assert.deepEqual(twin.parseSettings(raw), expected);
        }
        for (const s of [{ rightPanel: false }, { rightPanel: true }, {}]) {
            assert.equal(twin.serializeSettings(s), serializeSettings(s));
        }
        // ...plus literal source equality of the shared code (quotes + whitespace + export keyword normalized)
        const norm = (code) => code.replaceAll('"', "'").replaceAll(/\bexport\s+/g, '').replaceAll(/,\s*}/g, ' }').replaceAll('\t', '    ').replaceAll(/\s+/g, ' ').trim();
        assert.equal(norm(twin.SETTINGS_KEY + ''), norm(SETTINGS_KEY), 'SETTINGS_KEY drift');
        assert.deepEqual(twin.DEFAULT_UI_SETTINGS, DEFAULT_UI_SETTINGS);
        assert.equal(norm(String(twin.parseSettings)), norm(String(parseSettings)), 'parseSettings drift');
        assert.equal(norm(String(twin.serializeSettings)), norm(String(serializeSettings)), 'serializeSettings drift');
    } finally {
        cleanup();
    }
});
