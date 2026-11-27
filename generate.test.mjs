import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureLandingPage, within } from './generate.mjs';

const repo = {
    full_name: 'SkyCD/Test', description: 'A "quoted" & <tag> repository',
    html_url: 'https://github.com/SkyCD/Test', owner: { avatar_url: 'https://avatars.githubusercontent.com/u/1' },
};

function scratch(t) {
    const directory = mkdtempSync(join(tmpdir(), 'marketplace-action-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return directory;
}

test('the fallback page redirects and escapes repository metadata', t => {
    const site = scratch(t);
    ensureLandingPage(site, repo);
    const html = readFileSync(join(site, 'index.html'), 'utf8');
    assert.match(html, /http-equiv="refresh" content="0; url=https:\/\/github.com\/SkyCD\/Test"/);
    assert.match(html, /&quot;quoted&quot; &amp; &lt;tag&gt;/);
    assert.match(html, /og:image/);
});

for (const filename of ['index.html', 'index.htm']) {
    test('preserves an existing ' + filename, t => {
        const site = scratch(t);
        writeFileSync(join(site, filename), 'Existing site');
        ensureLandingPage(site, repo);
        assert.equal(readFileSync(join(site, filename), 'utf8'), 'Existing site');
        assert.equal(existsSync(join(site, 'index.html')), filename === 'index.html');
    });
}

test('accepts nested feed paths and rejects paths outside the site', t => {
    const site = scratch(t);
    assert.equal(within(site, 'tools/nuget'), join(site, 'tools', 'nuget'));
    assert.throws(() => within(site, '../other'), /inside the site directory/);
});
