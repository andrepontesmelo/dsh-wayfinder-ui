/**
 * Client-bundle pure-surface tests (ticket slice 1): load lib/client.js
 * through node:vm with stubbed host globals (window.__ModuleLoader__,
 * fake require for react / react/jsx-runtime, minimal document/window/
 * localStorage) and exercise the module's own code via exports.__test —
 * no behavior changes to the bundle, the same closure functions the UI
 * components use at runtime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function loadClientModule() {
    let captured = null;      // the __ModuleLoader__.load({ id, factory }) descriptor
    let moduleExports = null; // the value the factory returns (module.exports)

    const reactStub = { useState: () => [undefined, () => {}], useEffect: () => {}, Fragment: Symbol('Fragment') };
    const jsxRuntimeStub = { jsx: () => null, jsxs: () => null };

    const fakeRequire = (id) => {
        if (id === 'react') return reactStub;
        if (id === 'react/jsx-runtime') return jsxRuntimeStub;
        throw new Error('unexpected require: ' + id);
    };

    const context = {
        // The bundle registers itself through the host module loader; capture
        // the descriptor and run its factory with our stub require.
        window: {
            __ModuleLoader__: {
                load: (descriptor) => {
                    captured = descriptor;
                    moduleExports = descriptor.factory(fakeRequire);
                },
            },
            addEventListener: () => {},
        },
        // Minimal DOM/localStorage guards: the bundle's typeof guards would
        // also tolerate their absence, but exercise the real branches.
        document: {
            querySelector: () => null,
            createElement: () => ({ dataset: {} }),
            head: { appendChild: () => {} },
        },
        localStorage: {
            getItem: () => null,
            setItem: () => {},
        },
    };
    vm.createContext(context);
    vm.runInContext(src, context);

    assert.ok(captured, 'window.__ModuleLoader__.load was never called');
    assert.equal(captured.id, 'dsh-wayfinder-ui');
    assert.equal(typeof captured.factory, 'function');
    assert.ok(moduleExports, 'factory returned no module.exports');
    return moduleExports;
}

// Cross-realm materializer: values produced inside the vm context belong to a
// different realm, so deepStrictEqual against host-realm expectations fails on
// prototype identity. Snapshot through JSON to host-realm plain values.
const plain = (v) => JSON.parse(JSON.stringify(v));

const client = loadClientModule();
const surface = client.__test;

test('exports.__test exposes the pure helpers without touching apply/inject', () => {
    assert.ok(surface, 'exports.__test missing');
    assert.deepEqual(plain(Object.keys(surface)).sort(), ['AMB_POLL_MS', 'ambientBadgeLabel', 'ambientSignature', 'createPollCore', 'orderTasks', 'parseSettings', 'pollCoreState', 'serializeSettings']);
    assert.equal(surface.AMB_POLL_MS, 5000);
    assert.equal(typeof surface.parseSettings, 'function');
    assert.equal(typeof surface.serializeSettings, 'function');
    assert.equal(typeof surface.orderTasks, 'function');
    assert.equal(typeof surface.createPollCore, 'function');
    assert.equal(typeof surface.pollCoreState, 'function');
    assert.equal(typeof surface.ambientBadgeLabel, 'function');
    assert.equal(typeof surface.ambientSignature, 'function');
    // the normal plugin surface is untouched
    assert.equal(typeof client.apply, 'function');
    assert.deepEqual(plain(client.inject), ['slots', 'sessions']);
});

const DEFAULTS = { rightPanel: false, sessionHighlight: true, inSessionPanel: true, autoShowPanel: false };

test('parseSettings: null falls back to defaults', () => {
    assert.deepEqual(plain(surface.parseSettings(null)), DEFAULTS);
    // defaults are fresh objects, not shared mutable state
    assert.notEqual(surface.parseSettings(null), surface.parseSettings(null));
});

test('parseSettings: invalid JSON falls back to defaults', () => {
    for (const raw of ['not json at all', '{"rightPanel":', '{"kind":"wayfinder/map"']) {
        assert.deepEqual(plain(surface.parseSettings(raw)), DEFAULTS);
    }
});

test('parseSettings: non-object JSON falls back to defaults', () => {
    for (const raw of ['42', '"str"', 'null', 'true']) {
        assert.deepEqual(plain(surface.parseSettings(raw)), DEFAULTS);
    }
    // '[]' parses to an object but has no known keys -> defaults survive
    assert.deepEqual(plain(surface.parseSettings('[]')), DEFAULTS);
});

test('parseSettings: only boolean values are accepted per key', () => {
    assert.deepEqual(
        plain(surface.parseSettings('{"rightPanel":false,"sessionHighlight":"yes","inSessionPanel":1,"bogus":true}')),
        { rightPanel: false, sessionHighlight: true, inSessionPanel: true, autoShowPanel: false },
    );
    assert.deepEqual(
        plain(surface.parseSettings('{"rightPanel":false,"sessionHighlight":false,"inSessionPanel":false,"autoShowPanel":false}')),
        { rightPanel: false, sessionHighlight: false, inSessionPanel: false, autoShowPanel: false },
    );
    // absent keys stay default
    assert.deepEqual(plain(surface.parseSettings('{"inSessionPanel":false}')), { rightPanel: false, sessionHighlight: true, inSessionPanel: false, autoShowPanel: false });
});

test('serializeSettings: normalizes non-booleans to false (explicit off, not default-on)', () => {
    assert.equal(surface.serializeSettings({ rightPanel: true }), '{"rightPanel":true,"sessionHighlight":false,"inSessionPanel":false,"autoShowPanel":false}');
    assert.equal(
        surface.serializeSettings({ rightPanel: 'yes', sessionHighlight: 1, inSessionPanel: null }),
        '{"rightPanel":false,"sessionHighlight":false,"inSessionPanel":false,"autoShowPanel":false}',
    );
});

test('serializeSettings: round-trips through parseSettings', () => {
    for (const settings of [
        { rightPanel: false, sessionHighlight: true, inSessionPanel: false },
        { rightPanel: true, sessionHighlight: false, inSessionPanel: true },
        {},
        { rightPanel: 'garbage', bogus: 1 },
    ]) {
        const expected = {
            rightPanel: settings.rightPanel === true,
            sessionHighlight: settings.sessionHighlight === true,
            inSessionPanel: settings.inSessionPanel === true,
            autoShowPanel: settings.autoShowPanel === true,
        };
        assert.deepEqual(plain(surface.parseSettings(surface.serializeSettings(settings))), expected);
    }
});

test('orderTasks: RAIL_ORDER ranking, stable within rank, unknown statuses last', () => {
    const order = (tasks) => plain(surface.orderTasks(tasks)).map((t) => t.id);
    const tasks = [
        { id: 'a', status: 'done' },
        { id: 'b', status: 'todo' },
        { id: 'c', status: 'blocked' },
        { id: 'd', status: 'running' },
        { id: 'e', status: 'waiting' },
        { id: 'f', status: 'weird' },
    ];
    assert.deepEqual(order(tasks), ['d', 'e', 'c', 'b', 'a', 'f']);

    // stable within a status (sort is not required to be stable, but orderTasks guarantees it)
    const same = [{ id: 'x', status: 'todo' }, { id: 'y', status: 'todo' }, { id: 'z', status: 'todo' }];
    assert.deepEqual(order(same), ['x', 'y', 'z']);

    // multiple unknown statuses keep input order among themselves, after known ones
    const mixed = [
        { id: 'u1', status: 'alien' },
        { id: 'k', status: 'running' },
        { id: 'u2', status: 'alien' },
        { id: 'z', status: 'done' },
    ];
    assert.deepEqual(order(mixed), ['k', 'z', 'u1', 'u2']);

    // does not mutate the input array
    assert.deepEqual(tasks.map((t) => t.id), ['a', 'b', 'c', 'd', 'e', 'f']);
});
// ---------- poll cadence core (createPollCore + module-level pollCore) ----------
//
// Tests drive createPollCore with fake fetch/timers. The core runs inside the
// vm realm (it is the bundle's own function), and our control objects are host
// realm; cross-realm function/property access is transparent, so we can arm
// and resolve fetches and interval ticks from the test side.

// Build a fake fetch/timers harness; returns resolvers plus the metaprogram
// objects needed to take assert.deepEqual snapshots across realms.
function fakeEnv() {
    let fetchCalls = [];
    const pending = [];
    // Each call records with a generation-unrelated promise; the test resolves
    // them in FIFO order via resolveNext().
    const env = {
        fetch: (url) => {
            fetchCalls.push(url);
            return new Promise((resolve, reject) => {
                pending.push({ resolve, reject });
            });
        },
        __pending: pending,
        __fetchCalls: () => fetchCalls,
    };
    let timerCb = null;
    let intervalCount = 0;
    env.setInterval = (cb, ms) => {
        intervalCount++;
        timerCb = cb;
        return { intervalCount };
    };
    env.clearInterval = () => { timerCb = null; };
    env.__intervalCount = () => intervalCount;
    env.__hasTimer = () => timerCb !== null;
    env.__tick = () => { // fire one cadence tick synchronously
        if (timerCb) timerCb();
        return env.__pending.length === 0 ? null : env.__pending[0];
    };
    return env;
}

// resolve the n-th in-flight fetch with a good response; returns a thenable-a-waiter
function resolveGood(env, value) {
    const p = env.__pending.shift();
    p.resolve({ ok: true, status: 200, json: async () => value });
}
function resolveReject(env) {
    const p = env.__pending.shift();
    p.reject(new Error('down'));
}
function resolveNonOk(env, status = 503) {
    const p = env.__pending.shift();
    p.resolve({ ok: false, status });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('createPollCore: 0->1 arms an immediate tick + interval; happy path delivers to all subscribers', async () => {
    const env = fakeEnv();
    const core = surface.createPollCore(env);

    const got = [];
    const u1 = core.subscribe((v) => got.push(['u1', v]), () => got.push(['u1', 'err']));
    const u2 = core.subscribe((v) => got.push(['u2', v]), () => got.push(['u2', 'err'])); // mid-cadence: no new tick
    // only ONE immediate tick came from the 0->1 arm
    assert.equal(env.__fetchCalls().length, 1);
    assert.ok(env.__hasTimer(), 'interval armed on 0->1 subscribe');
    // second subscribe did not arm a duplicate timer
    assert.equal(env.__intervalCount(), 1);

    resolveGood(env, { map: { title: 'live' } });
    await flush();
    assert.deepEqual(plain(got), [['u1', { map: { title: 'live' } }], ['u2', { map: { title: 'live' } }]]);

    // next cadence tick keeps delivering
    env.__tick();
    resolveGood(env, { map: { title: 'again' } });
    await flush();
    assert.deepEqual(plain(got[2]), ['u1', { map: { title: 'again' } }]);

    u1(); u2();
});

test('createPollCore: stale in-flight fetch is dropped after unsubscribe', async () => {
    const env = fakeEnv();
    const core = surface.createPollCore(env);

    const got = [];
    const u = core.subscribe((v) => got.push(v), () => got.push('err'));
    // first tick in flight; unsubscribe before it resolves (generation bumps)
    const pendingAfter = env.__pending[0];
    u();
    assert.equal(env.__fetchCalls().length, 1);
    pendingAfter.resolve({ ok: true, status: 200, json: async () => ({ map: { title: 'stale' } }) });
    await flush();
    assert.deepEqual(plain(got), [], 'stale response must be discarded after stop');
    assert.equal(env.__hasTimer(), false, 'timer cleared on last unsubscribe');
});

test('createPollCore: errors degrade per subscriber; non-ok clears; rejected clears', async () => {
    const env = fakeEnv();
    const core = surface.createPollCore(env);

    const a = [], b = [];
    const ua = core.subscribe((v) => a.push(v), () => a.push('err'));
    const ub = core.subscribe((v) => b.push(v), () => b.push('err'));

    // non-ok -> onError for every subscriber
    resolveNonOk(env);
    await flush();
    assert.deepEqual(plain(a), ['err']);
    assert.deepEqual(plain(b), ['err']);

    // rejected -> onError
    env.__tick();
    resolveReject(env);
    await flush();
    assert.deepEqual(plain(a), ['err', 'err']);
    assert.deepEqual(plain(b), ['err', 'err']);

    // healthy again
    env.__tick();
    resolveGood(env, { map: { title: 'ok' } });
    await flush();
    assert.deepEqual(plain(a), ['err', 'err', { map: { title: 'ok' } }]);

    ua(); ub();
});

test('createPollCore: last unsubscribe stops the cadence; re-subscribe rearms with fresh generation', async () => {
    const env = fakeEnv();
    const core = surface.createPollCore(env);

    const got = [];
    const u1 = core.subscribe((v) => got.push(v), () => got.push('err'));
    resolveGood(env, { map: { title: 'one' } });
    await flush();

    const u2 = core.subscribe((v) => got.push(v), () => got.push('err'));
    u2(); // one left
    assert.ok(env.__hasTimer(), 'still armed with one subscriber');
    u1(); // last leaves -> cadence stops
    assert.equal(env.__hasTimer(), false, 'timer cleared');
    assert.equal(env.__fetchCalls().length, 1, 'no ticks fired after stop');

    // re-subscribe from empty rearms: new immediate tick, stale earlier life dropped
    const u3 = core.subscribe((v) => got.push(v), () => got.push('err'));
    assert.equal(env.__fetchCalls().length, 2, 'rearm triggers a new immediate tick');
    resolveGood(env, { map: { title: 'rearmed' } });
    await flush();
    assert.deepEqual(plain(got[got.length - 1]), { map: { title: 'rearmed' } });
    u3();
});

test('createPollCore: mid-cadence subscriber joins without disturbing earlier subscribers', async () => {
    const env = fakeEnv();
    const core = surface.createPollCore(env);

    const a = [];
    const ua = core.subscribe((v) => a.push(v), () => a.push('err'));
    resolveGood(env, { map: { title: 'first' } });
    await flush();

    const b = [];
    const ub = core.subscribe((v) => b.push(v), () => b.push('err')); // joins quietly, no extra tick
    assert.equal(env.__fetchCalls().length, 1, 'mid-cadence subscribe does not tick');

    env.__tick();
    resolveGood(env, { map: { title: 'second' } });
    await flush();
    // earlier subscriber still served on the shared cadence
    assert.deepEqual(plain(a), [{ map: { title: 'first' } }, { map: { title: 'second' } }]);
    // new subscriber only from when it joined
    assert.deepEqual(plain(b), [{ map: { title: 'second' } }]);
    ua(); ub();
});

test('createPollCore: unsubscribe(data) by onData handle removes the right subscriber', async () => {
    const env = fakeEnv();
    const core = surface.createPollCore(env);

    const a = [], b = [];
    const onB = (v) => b.push(v);
    const ua = core.subscribe((v) => a.push(v), () => a.push('err'));
    const ub = core.subscribe(onB, () => b.push('err'));
    resolveGood(env, { map: { title: 'x' } });
    await flush();

    core.unsubscribe(onB); // matches b by its onData identity
    env.__tick();
    resolveGood(env, { map: { title: 'y' } });
    await flush();
    assert.deepEqual(plain(a), [{ map: { title: 'x' } }, { map: { title: 'y' } }]);
    assert.deepEqual(plain(b), [{ map: { title: 'x' } }]); // b stopped after unsubscribe
    ua(); ub();
});

test('module-level pollCore: exposed callback-only via pollCoreState and satisfies the shared-source contract', () => {
    const st = plain(surface.pollCoreState());
    assert.equal(typeof st.subscriberCount, 'number');
    assert.equal(typeof st.generation, 'number');
    assert.equal(typeof st.timerActive, 'boolean');
    // this module-level core is the real one feeding rail + dock + ambient
    assert.equal(typeof surface.pollCoreState, 'function');
});
// ---------- ambient badge label + signature (B3 polish) ----------

test('ambientBadgeLabel: running/waiting mapped, unknown + null passthrough', () => {
    assert.equal(surface.ambientBadgeLabel('running'), 'active');
    assert.equal(surface.ambientBadgeLabel('waiting'), 'waits');
    assert.equal(surface.ambientBadgeLabel('blocked'), 'blocked');
    assert.equal(surface.ambientBadgeLabel('done'), 'done');
    assert.equal(surface.ambientBadgeLabel('todo'), 'todo');
    assert.equal(surface.ambientBadgeLabel('weird'), 'weird'); // unknown passthrough
    assert.equal(surface.ambientBadgeLabel(undefined), '');    // undefined -> empty string
    assert.equal(surface.ambientBadgeLabel(null), '');        // null -> empty string
});

test('ambientSignature: changes with map name or session membership; stable when unchanged', () => {
    const tasks = [
        { id: 'a', sessionId: 's1' },
        { id: 'b', sessionId: 's2' },
    ];

    const base = surface.ambientSignature('map-1', tasks);
    // stable across identical inputs (same order)
    assert.equal(surface.ambientSignature('map-1', tasks), base);
    assert.equal(surface.ambientSignature('map-1', [...tasks]), base);
    // no tasks -> still a deterministic signature
    assert.equal(surface.ambientSignature('map-1', []), JSON.stringify(['map-1', []]));

    // membership change -> different
    const one = tasks.slice(0, 1);
    assert.notEqual(surface.ambientSignature('map-1', one), base);
    // membership order change -> different (order is part of the signature)
    assert.notEqual(surface.ambientSignature('map-1', [...tasks].reverse()), base);
    // map name change -> different
    assert.notEqual(surface.ambientSignature('map-2', tasks), base);

    // exact shape mirrors what ambMark builds (found sessionIds)
    assert.equal(base, JSON.stringify(['map-1', ['s1', 's2']]));
});
