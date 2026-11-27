import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

const maxPackageSize = 64 * 1024 * 1024;

export function versionOrder(left, right) {
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

export async function readPackage(asset, packageId, version) {
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
