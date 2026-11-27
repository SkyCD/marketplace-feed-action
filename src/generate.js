import { relative, sep } from 'node:path';
import { pagesBaseUrl, releasePackages, repositoryMetadata } from './github.js';
import { ensureLandingPage, within, writeJson } from './site.js';

export async function generateFeed(options) {
    const repo = await repositoryMetadata(options.github, options.repository);
    const packageId = options.packageId || repo.name;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packageId)) {
        throw new Error('Invalid NuGet package ID: ' + packageId);
    }
    const site = within(options.workspace, options.siteDirectory || '_site');
    const subfolder = options.feedSubfolder || '';
    const output = within(site, subfolder);
    const baseUrl = await pagesBaseUrl(options.github, options.repository, options.baseUrl);
    const rootUrl = new URL(baseUrl.replace(/\/+$/, '') + '/');
    if (rootUrl.protocol !== 'https:' || rootUrl.username || rootUrl.password || rootUrl.search || rootUrl.hash) {
        throw new Error('base-url must be a credential-free HTTPS site URL.');
    }
    const location = relative(site, output).split(sep).filter(Boolean).map(encodeURIComponent).join('/');
    const base = new URL(location ? location + '/' : './', rootUrl).href;
    const releases = await releasePackages(options.github, repo, packageId);
    if (!releases.length) throw new Error('No published release assets found for ' + packageId);
    const latest = releases.findLast(release => !release.version.includes('-')) ?? releases.at(-1);
    const registrationPath = 'registration/' + packageId.toLowerCase() + '/';
    const registrationUrl = base + registrationPath + 'index.json';
    const items = releases.map(release => {
        const version = release.version.toLowerCase();
        const leaf = base + registrationPath + version + '.json';
        const detail = base + registrationPath + version + '.metadata.json';
        const page = base + registrationPath + version + '.page.json';
        const catalogEntry = {
            '@id': detail, id: packageId, version: release.version, listed: true,
            dependencyGroups: release.dependencyGroups,
        };
        const entry = { '@id': leaf, catalogEntry, packageContent: release.content, registration: registrationUrl };
        const registrationPage = { '@id': page, lower: version, upper: version, count: 1, items: [entry] };
        writeJson(output, registrationPath + version + '.json', {
            '@id': leaf, catalogEntry: detail, packageContent: release.content, registration: registrationUrl, listed: true,
        });
        writeJson(output, registrationPath + version + '.metadata.json', catalogEntry);
        writeJson(output, registrationPath + version + '.page.json', { ...registrationPage, parent: registrationUrl });
        return registrationPage;
    });
    writeJson(output, registrationPath + 'index.json', { '@id': registrationUrl, count: items.length, items });
    writeJson(output, 'index.json', { version: '3.0.0', resources: [
        { '@id': base + 'registration/', '@type': 'RegistrationsBaseUrl/3.6.0' },
    ] });
    writeJson(output, 'plugins.json', { schemaVersion: 1, publisher: repo.owner.login, projectUrl: repo.html_url,
        feed: base + 'index.json', packages: [{
            id: packageId, projectUrl: repo.html_url, displayName: options.displayName || latest.title || packageId,
            summary: latest.description || repo.description, license: latest.license,
            releases: releases.map(release => ({
                version: release.version, minHostVersion: options.minHostVersion || '3.0.0',
                maxHostVersion: options.maxHostVersion || undefined,
            })),
        }],
    });
    ensureLandingPage(site, repo);
    console.log('Generated ' + releases.length + ' release(s) at ' + base);
}
