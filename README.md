# SkyCD Marketplace Feed Action

Generate a NuGet v3 registration-only feed and a SkyCD publisher manifest from published GitHub Release assets named `<PackageId>.<version>.nupkg` on `v<version>` tags. The deployment contains JSON and HTML. Package URLs point to the release attachments.

## Generate files in an existing site build

Run the JavaScript generator via the composite action after building the site. Pass the same directory to your own upload or deployment step.

```yaml
- uses: SkyCD/marketplace-feed-action@v1
  with:
    base-url: https://example.github.io/project/
    site-directory: dist
    feed-subfolder: nuget
```

The example writes `dist/nuget/index.json`, `dist/nuget/plugins.json`, and `dist/nuget/registration/`. Omit `feed-subfolder` to generate at the site root. A site-root `index.html` or `index.htm` is preserved. If neither exists, the action creates a landing page with repository title, description, Open Graph metadata, a redirect, and a link to the repository.

## Generate an artifact or deploy to Pages

Enable **GitHub Actions** as the source in the caller repository's Pages settings for deployment.

```yaml
jobs:
  marketplace:
    permissions:
      contents: read
      pages: write
      id-token: write
    uses: SkyCD/marketplace-feed-action/.github/workflows/publish.yml@v1
    with:
      publish: true
      feed-subfolder: nuget
```

Set `publish: false` and specify `base-url` to upload the generated site as a workflow artifact. For an existing site build that needs additional steps before deployment, use the composite action instead of the reusable workflow.

Optional inputs include `package-id` (defaults to the repository name), `display-name`, `min-host-version` (defaults to `3.0.0`), and `max-host-version`. The generator needs Node.js and a ZIP extraction utility. The reusable workflow supplies both on Ubuntu.

Run `npm ci` and `npm test` to verify the generator locally.
