import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

await build({
    entryPoints: ['src/cli.js'],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    legalComments: 'external',
    outfile: 'dist/index.js',
    banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
});

const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const notices = Object.keys(packages).sort()
    .filter(path => path && !packages[path].dev)
    .flatMap(path => {
        const files = readdirSync(path).filter(name => /^(license|copying|notice)(\.|$)/i.test(name)).sort();
        if (files.length === 0) throw new Error('No license notice found for ' + path);
        return files.map(file => {
            const contents = readFileSync(join(path, file), 'utf8').replaceAll('\r\n', '\n').trimEnd();
            return path + ' (' + packages[path].version + ') — ' + file + '\n\n' + contents;
        });
    });
writeFileSync('dist/THIRD-PARTY-NOTICES.txt', notices.join('\n\n' + '-'.repeat(72) + '\n\n') + '\n');
