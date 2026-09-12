import test from 'node:test';
import assert from 'node:assert/strict';
import { injectionText, WAYFINDER_CONTRACT, WAYFINDER_INJECTION_SOURCE } from '../lib/inject.js';

const header = () => ({ cwd: '/tmp/x' });

test('startup + plain header returns exactly WAYFINDER_CONTRACT', () => {
    assert.equal(injectionText(header(), 'startup'), WAYFINDER_CONTRACT);
    assert.equal(injectionText(header()), WAYFINDER_CONTRACT);
});

test('contract contains the three verbs and is <= 300 chars', () => {
    assert.equal(typeof WAYFINDER_CONTRACT, 'string');
    for (const verb of ['wayfinder_map_create', 'wayfinder_task_resolve', 'wayfinder_map_sync']) {
        assert.ok(WAYFINDER_CONTRACT.includes(verb), `missing ${verb}`);
    }
    assert.ok(WAYFINDER_CONTRACT.length <= 300, `length ${WAYFINDER_CONTRACT.length} > 300`);
});

test('resume and compact sources return null', () => {
    assert.equal(injectionText(header(), 'resume'), null);
    assert.equal(injectionText(header(), 'compact'), null);
});

test('missing or empty cwd returns null', () => {
    assert.equal(injectionText({}, 'startup'), null);
    assert.equal(injectionText({ cwd: '' }, 'startup'), null);
});

test('delegated or subagent sessions return null', () => {
    assert.equal(injectionText({ cwd: '/tmp/x', delegationDepth: 1 }, 'startup'), null);
    assert.equal(injectionText({ cwd: '/tmp/x', origin: 'subagent' }, 'startup'), null);
});

test('WAYFINDER_INJECTION_SOURCE shape', () => {
    assert.deepEqual(WAYFINDER_INJECTION_SOURCE, { kind: 'plugin', plugin: 'dsh-wayfinder-ui', form: 'instructions' });
});
