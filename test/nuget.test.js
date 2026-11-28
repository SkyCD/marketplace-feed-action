import assert from 'node:assert/strict';
import test from 'node:test';
import { readPackage } from '../src/nuget.js';

test('accepts asset sizes through 128 MiB before downloading', async (context) => {
    const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
    const asset = {
        name: 'Example.0.1.0.nupkg',
        size: 128 * 1024 * 1024,
        browser_download_url: 'https://example.invalid/package.nupkg',
    };

    await assert.rejects(readPackage(asset, 'Example', '0.1.0'), /Package download failed/);
    await assert.rejects(readPackage({ ...asset, size: asset.size + 1 }, 'Example', '0.1.0'),
        /Package exceeds marketplace size limit/);
    assert.equal(fetch.mock.callCount(), 1);
});
