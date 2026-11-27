import { getInput, setFailed } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { generateFeed } from './generate.js';

try {
    await generateFeed({
        github: getOctokit(getInput('token', { required: true })),
        repository: context.repo,
        workspace: process.env.GITHUB_WORKSPACE ?? process.cwd(),
        packageId: getInput('package-id'),
        siteDirectory: getInput('site-directory'),
        feedSubfolder: getInput('feed-subfolder'),
        baseUrl: getInput('base-url'),
        displayName: getInput('display-name'),
        minHostVersion: getInput('min-host-version'),
        maxHostVersion: getInput('max-host-version'),
    });
} catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
}
