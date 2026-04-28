import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    deriveSenderKey,
    extractEmail,
    extractTwitterHandle,
    extractDomain,
    normalizeUrl,
} from './sender-key.js';

test('extractEmail: display name with angle brackets', () => {
    assert.equal(extractEmail('Morning Brew <crew@morningbrew.com>'), 'crew@morningbrew.com');
});

test('extractEmail: bare email', () => {
    assert.equal(extractEmail('crew@morningbrew.com'), 'crew@morningbrew.com');
});

test('extractEmail: mixed case is lowercased', () => {
    assert.equal(extractEmail('Crew@MorningBrew.COM'), 'crew@morningbrew.com');
});

test('extractEmail: plus-addressing is stripped', () => {
    assert.equal(extractEmail('foo+newsletter@bar.com'), 'foo@bar.com');
    assert.equal(extractEmail('Morning Brew <foo+a@bar.com>'), 'foo@bar.com');
});

test('extractEmail: no email returns null', () => {
    assert.equal(extractEmail('just a name'), null);
    assert.equal(extractEmail(''), null);
    assert.equal(extractEmail(null), null);
    assert.equal(extractEmail(undefined), null);
});

test('extractEmail: picks the first email in a longer string', () => {
    assert.equal(
        extractEmail('Reply to a@x.com or b@y.com'),
        'a@x.com'
    );
});

test('extractTwitterHandle: from twitter.com URL', () => {
    assert.equal(extractTwitterHandle('https://twitter.com/elonmusk/status/123'), '@elonmusk');
});

test('extractTwitterHandle: from x.com URL', () => {
    assert.equal(extractTwitterHandle('https://x.com/Naval/status/456'), '@naval');
});

test('extractTwitterHandle: from bare @handle', () => {
    assert.equal(extractTwitterHandle('posted by @paulg today'), '@paulg');
});

test('extractTwitterHandle: no handle returns null', () => {
    assert.equal(extractTwitterHandle('no twitter here'), null);
    assert.equal(extractTwitterHandle(null), null);
});

test('extractDomain: strips www and lowercases', () => {
    assert.equal(extractDomain('https://www.Stratechery.com/2024/ai-posts'), 'stratechery.com');
});

test('extractDomain: handles bare domain without scheme', () => {
    assert.equal(extractDomain('stratechery.com/foo'), 'stratechery.com');
});

test('extractDomain: malformed URL returns null', () => {
    assert.equal(extractDomain('not a url'), null);
    assert.equal(extractDomain(''), null);
    assert.equal(extractDomain(null), null);
});

test('normalizeUrl: strips trailing slash and lowercases host', () => {
    assert.equal(
        normalizeUrl('https://Example.com/feed/'),
        'https://example.com/feed'
    );
});

test('normalizeUrl: keeps path casing (feed paths are case-sensitive)', () => {
    // Some feed paths are case-sensitive; only the host is normalized.
    assert.equal(
        normalizeUrl('https://example.com/Feed/RSS'),
        'https://example.com/Feed/RSS'
    );
});

test('deriveSenderKey: email source', () => {
    assert.equal(
        deriveSenderKey({ source: 'email', rawSender: 'Morning Brew <crew@morningbrew.com>' }),
        'crew@morningbrew.com'
    );
});

test('deriveSenderKey: twitter source from URL', () => {
    assert.equal(
        deriveSenderKey({ source: 'twitter', url: 'https://x.com/Naval/status/1' }),
        '@naval'
    );
});

test('deriveSenderKey: twitter source falls back to rawSender', () => {
    assert.equal(
        deriveSenderKey({ source: 'twitter', rawSender: '@paulg (Paul Graham)' }),
        '@paulg'
    );
});

test('deriveSenderKey: url source uses domain', () => {
    assert.equal(
        deriveSenderKey({ source: 'url', url: 'https://www.stratechery.com/2024/post' }),
        'stratechery.com'
    );
});

test('deriveSenderKey: rss source uses feed URL', () => {
    assert.equal(
        deriveSenderKey({ source: 'rss', feedUrl: 'https://Stratechery.com/feed/' }),
        'https://stratechery.com/feed'
    );
});

test('deriveSenderKey: pdf source returns null', () => {
    assert.equal(deriveSenderKey({ source: 'pdf', rawSender: 'PDF Upload' }), null);
});

test('deriveSenderKey: manual with email-like source', () => {
    assert.equal(
        deriveSenderKey({ source: 'manual', rawSender: 'hi@substack.com' }),
        'hi@substack.com'
    );
});

test('deriveSenderKey: manual with free-text source returns null', () => {
    assert.equal(
        deriveSenderKey({ source: 'manual', rawSender: 'my notes' }),
        null
    );
});

test('deriveSenderKey: unknown source falls back to email extraction', () => {
    assert.equal(
        deriveSenderKey({ rawSender: 'Foo <foo@bar.com>' }),
        'foo@bar.com'
    );
});

test('deriveSenderKey: missing inputs return null safely', () => {
    assert.equal(deriveSenderKey(), null);
    assert.equal(deriveSenderKey({}), null);
    assert.equal(deriveSenderKey({ source: 'email' }), null);
});
