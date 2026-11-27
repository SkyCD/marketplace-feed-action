# SkyCD Marketplace Feed Action

Generate a NuGet v3 registration-only feed and a SkyCD publisher manifest from published GitHub Release assets named `<PackageId>.<version>.nupkg` on `v<version>` tags. The deployment contains JSON and HTML. Package URLs point to the release attachments.

## Generate files in an existing site build

Run the action after building the site. Pass the same directory to your upload or deployment step. Give the job `contents: read` and `pages: read` permissions so the action can read the repository's Pages URL, including its custom domain.

```yaml
- uses: SkyCD/marketplace-feed-action@v1.2.0
  with:
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
    uses: SkyCD/marketplace-feed-action/.github/workflows/publish.yml@v1.2.0
    with:
      publish: true
      feed-subfolder: nuget
```

Set `publish: false` to upload the generated site as a workflow artifact. In either mode, `base-url` is an optional override for a site hosted elsewhere or for a repository without Pages enabled. For an existing site build that needs additional steps before deployment, use the JavaScript action instead of the reusable workflow.

Optional inputs include `package-id` (defaults to the repository name), `display-name`, `min-host-version` (defaults to `3.0.0`), and `max-host-version`. The action runs on the built-in Node.js 24 runtime. It uses unzip on Linux and macOS and tar.exe on Windows.

Run `npm ci`, `npm test`, and `npm run build` to verify the generator and refresh the bundle.

## Repository layout

- `action.yml` defines the JavaScript action inputs.
- `.github/workflows/publish.yml` generates an artifact or deploys it to GitHub Pages.
- `src/cli.js` reads the action environment and invokes the generator.
- `src/generate.js` writes the NuGet registration index and marketplace manifest.
- `src/github.js` discovers published release assets through the official `@actions/github` client.
- `src/nuget.js` reads NuGet package metadata and compares versions.
- `src/site.js` writes site files and the fallback landing page.
- 	est/ contains the automated tests.
- scripts/build.js builds the checked-in runtime bundle under dist/.

The action is licensed under [MIT](LICENSE).
