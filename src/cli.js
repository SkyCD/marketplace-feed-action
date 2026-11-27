import { generateFeed } from './generate.js';

await generateFeed({
    repository: process.env.GITHUB_REPOSITORY,
    workspace: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    packageId: process.env.INPUT_PACKAGE_ID,
    siteDirectory: process.env.INPUT_SITE_DIRECTORY,
    feedSubfolder: process.env.INPUT_FEED_SUBFOLDER,
    baseUrl: process.env.INPUT_BASE_URL,
    displayName: process.env.INPUT_DISPLAY_NAME,
    minHostVersion: process.env.INPUT_MIN_HOST_VERSION,
    maxHostVersion: process.env.INPUT_MAX_HOST_VERSION,
});
