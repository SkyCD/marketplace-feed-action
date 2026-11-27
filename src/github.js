import { readPackage, versionOrder } from './nuget.js';

const versionPattern = /^v(\d+\.\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

export async function releasePackages(github, repo, packageId) {
    const releases = [];
    const pages = github.paginate.iterator(github.rest.repos.listReleases, {
        owner: repo.owner.login,
        repo: repo.name,
        per_page: 100,
    });
    for await (const { data } of pages) {
        for (const release of data) {
            const version = versionPattern.exec(release.tag_name)?.[1];
            if (!version || release.draft) continue;
            const name = packageId + '.' + version + '.nupkg';
            const asset = release.assets.find(asset => asset.name === name && asset.state === 'uploaded');
            if (!asset) continue;
            const expected = repo.html_url + '/releases/download/' + release.tag_name + '/' + name;
            if (asset.browser_download_url !== expected) throw new Error('Unexpected asset URL: ' + asset.name);
            releases.push(await readPackage(asset, packageId, version));
        }
    }
    return releases.sort((a, b) => versionOrder(a.version, b.version));
}

export async function repositoryMetadata(github, repository) {
    const { data } = await github.rest.repos.get(repository);
    return data;
}
