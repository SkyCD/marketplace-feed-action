import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const maxPackageSize = 64 * 1024 * 1024;
const versionPattern = /^v(\d+\.\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

export function within(root, path) {
    const full = resolve(root, path);
    const difference = relative(root, full);
    if (isAbsolute(difference) || difference === '..' || difference.startsWith('..' + sep)) {
        throw new Error('Output paths must stay inside the site directory.');
    }
    return full;
}

function escape(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function ensureLandingPage(site, repo) {
    if (['index.html', 'index.htm'].some(file => existsSync(join(site, file)))) return;

    const title = escape(repo.full_name);
    const description = escape(repo.description || 'Source code, releases and NuGet packages for ' + repo.full_name);
    const url = escape(repo.html_url);
    const image = repo.owner?.avatar_url
        ? '<meta property="og:image" content="' + escape(repo.owner.avatar_url) + '">' : '';
    writeFileSync(join(site, 'index.html'), '<!doctype html>\n<html lang="en">\n<head>\n'
        + '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + '<title>' + title + '</title>\n<meta name="description" content="' + description + '">\n'
        + '<link rel="canonical" href="' + url + '">\n<meta http-equiv="refresh" content="0; url=' + url + '">\n'
        + '<meta property="og:type" content="website">\n<meta property="og:title" content="' + title + '">\n'
        + '<meta property="og:description" content="' + description + '">\n<meta property="og:url" content="' + url + '">\n'
        + image + '\n</head>\n<body><h1>' + title + '</h1><p>' + description
        + '</p><p><a href="' + url + '">Open the GitHub repository</a></p></body>\n</html>\n');
}

function writeJson(directory, path, content) {
    const target = within(directory, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, JSON.stringify(content, null, 2) + '\n');
}

function versionOrder(left, right) {
    const [leftCore, ...leftSuffix] = left.split('-');
    const [rightCore, ...rightSuffix] = right.split('-');
    const leftNumbers = leftCore.split('.').map(Number);
    const rightNumbers = rightCore.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
        const difference = (leftNumbers[i] ?? 0) - (rightNumbers[i] ?? 0);
        if (difference) return difference;
    }
    if (!leftSuffix.length || !rightSuffix.length) return rightSuffix.length - leftSuffix.length;
    const leftLabels = leftSuffix.join('-').toLowerCase().split('.');
    const rightLabels = rightSuffix.join('-').toLowerCase().split('.');
    for (let i = 0; i < Math.min(leftLabels.length, rightLabels.length); i++) {
        const a = leftLabels[i], b = rightLabels[i];
        if (a === b) continue;
        const numericA = /^\d+$/.test(a), numericB = /^\d+$/.test(b);
        if (numericA && numericB) {
            const difference = BigInt(a) - BigInt(b);
            if (difference) return difference < 0n ? -1 : 1;
        } else if (numericA !== numericB) return numericA ? -1 : 1;
        else return a < b ? -1 : 1;
    }
    return leftLabels.length - rightLabels.length;
}

function dependencies(metadata) {
    const containers = metadata.getElementsByTagName('dependencies');
    if (!containers.length) return [];
    const groups = [...Array.from(containers[0].getElementsByTagName('group'))];
    return (groups.length ? groups : [containers[0]]).map(group => {
        const dependencies = Array.from(group.getElementsByTagName('dependency'), dependency => ({
            id: dependency.getAttribute('id'), range: dependency.getAttribute('version') || '(,)',
        }));
        return { targetFramework: group.getAttribute('targetFramework') || undefined, dependencies };
    });
}

async function readPackage(asset, packageId, version) {
    if (asset.size > maxPackageSize) throw new Error('Package exceeds marketplace size limit: ' + asset.name);
    const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Package download failed: ' + asset.name);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length !== asset.size) throw new Error('Unexpected package size: ' + asset.name);

    const scratch = mkdtempSync(join(tmpdir(), 'marketplace-feed-'));
    try {
        const path = join(scratch, 'package.nupkg');
        writeFileSync(path, data);
        const xml = process.platform === 'win32'
            ? execFileSync('tar.exe', ['-xOf', path, packageId + '.nuspec'], { encoding: 'utf8', maxBuffer: 256 * 1024 })
            : execFileSync('unzip', ['-p', path, packageId + '.nuspec'], { encoding: 'utf8', maxBuffer: 256 * 1024 });
        const document = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'text/xml');
        const metadata = document.getElementsByTagName('metadata')[0];
        const field = name => metadata?.getElementsByTagName(name)[0]?.textContent;
        if (field('id') !== packageId || field('version') !== version) {
            throw new Error('Package identity does not match release: ' + asset.name);
        }
        return {
            version, content: asset.browser_download_url,
            title: field('title'), description: field('description'), license: field('license'),
            dependencyGroups: dependencies(metadata),
        };
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

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

async function releasePackages(repo, packageId) {
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

async function run() {
    const repository = process.env.GITHUB_REPOSITORY;
    const repo = await api('/repos/' + repository);
    const packageId = process.env.INPUT_PACKAGE_ID || repo.name;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packageId)) {
        throw new Error('Invalid NuGet package ID: ' + packageId);
    }
    const site = within(process.env.GITHUB_WORKSPACE ?? process.cwd(), process.env.INPUT_SITE_DIRECTORY || '_site');
    const subfolder = process.env.INPUT_FEED_SUBFOLDER || '';
    const output = within(site, subfolder);
    const rootUrl = new URL(process.env.INPUT_BASE_URL.replace(/\/+$/, '') + '/');
    if (rootUrl.protocol !== 'https:' || rootUrl.username || rootUrl.password || rootUrl.search || rootUrl.hash) {
        throw new Error('base-url must be a credential-free HTTPS site URL.');
    }
    const location = relative(site, output).split(sep).filter(Boolean).map(encodeURIComponent).join('/');
    const base = new URL(location ? location + '/' : './', rootUrl).href;
    const releases = await releasePackages(repo, packageId);
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
            id: packageId, projectUrl: repo.html_url, displayName: process.env.INPUT_DISPLAY_NAME || latest.title || packageId,
            summary: latest.description || repo.description, license: latest.license,
            releases: releases.map(release => ({
                version: release.version, minHostVersion: process.env.INPUT_MIN_HOST_VERSION || '3.0.0',
                maxHostVersion: process.env.INPUT_MAX_HOST_VERSION || undefined,
            })),
        }],
    });
    ensureLandingPage(site, repo);
    console.log('Generated ' + releases.length + ' release(s) at ' + base);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
