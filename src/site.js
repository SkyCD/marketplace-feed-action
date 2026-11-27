import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

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

export function writeJson(directory, path, content) {
    const target = within(directory, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, JSON.stringify(content, null, 2) + '\n');
}
