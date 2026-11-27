import assert from 'node:assert/strict';
import test from 'node:test';
import { pagesBaseUrl } from '../src/github.js';

const repository = { owner: 'SkyCD', repo: 'Example' };
const github = getPages => ({ rest: { repos: { getPages } } });

test('reads the configured Pages URL, including a custom domain', async () => {
    const url = 'https://packages.example.org/';
    const client = github(async options => {
        assert.deepEqual(options, repository);
        return { data: { html_url: url } };
    });

    assert.equal(await pagesBaseUrl(client, repository), url);
});

test('an explicit URL skips Pages lookup', async () => {
    const client = github(() => assert.fail('Pages lookup must be skipped'));

    assert.equal(await pagesBaseUrl(client, repository, 'https://other.example/'), 'https://other.example/');
});

test('reports how to resolve missing Pages settings', async () => {
    const client = github(async () => {
        throw Object.assign(new Error('Not Found'), { status: 404 });
    });

    await assert.rejects(pagesBaseUrl(client, repository), /Enable Pages and grant pages: read/);
});
