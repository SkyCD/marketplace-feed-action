import { readPackage, versionOrder } from './nuget.js';

const versionPattern = /^v(\d+\.\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

async function api(path) {
    const response = await fetch('https://api.github.com' + path, {
        headers: {
            ...(process.env.GH_TOKEN ? { Authorization: 'Bearer ' + process.env.GH_TOKEN } : {}),
            Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('GitHub API failed: ' + path + ' (' + response.status + ')');
    return response.json();
}

export async function releasePackages(repo, packageId) {
    const releases = [];
    for (let page = 1; ; page++) {
        const batch = await api('/repos/' + repo.full_name + '/releases?per_page=100&page=' + page);
        for (const release of batch) {
            const version = versionPattern.exec(release.tag_name)?.[1];
            if (!version || release.draft) continue;
            const name = packageId + '.' + version + '.nupkg';
            const asset = release.assets.find(asset => asset.name === name && asset.state === 'uploaded');
            if (!asset) continue;
            const expected = repo.html_url + '/releases/download/' + release.tag_name + '/' + name;
            if (asset.browser_download_url !== expected) throw new Error('Unexpected asset URL: ' + asset.name);
            releases.push(await readPackage(asset, packageId, version));
        }
        if (batch.length < 100) break;
    }
    return releases.sort((a, b) => versionOrder(a.version, b.version));
}

export function repositoryMetadata(repository) {
    return api('/repos/' + repository);
}
