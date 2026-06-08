# Matter of Matter

Astro site for the migrated Matter of Matter blog.

## Commands

Run commands from this directory:

```sh
npm install
npm run migrate:blogger
npm run sync:docs
npm run backfill:docs
npm run dev
npm run build
```

## Content

- Published posts live in `src/content/blog`.
- Imported Blogger images live in `public/images/blogger`.
- Synced Google Docs images live in `public/images/docs`.
- Imported drafts are generated into `drafts/`, which is ignored by Git by default so they are not exposed in a public repository.
- `migration-audit.json` records post counts, copied images, and any remote images that did not map to local Takeout files.

## Google Docs Workflow

Google Docs is the primary writing surface. Astro remains the renderer.

1. Write drafts in the Google Drive drafts folder.
2. Move finished posts into the Google Drive publish folder.
3. Run the GitHub Actions workflow named `Sync Google Docs`.
4. The workflow exports published Google Docs, saves generated Markdown into `src/content/blog`, downloads images into `public/images/docs`, builds the site, and commits the generated output.

To migrate the existing archive into Google Docs first, run `Backfill Archive To Google Docs` in GitHub Actions. Start with `limit=3`, confirm the generated Docs look right, then run again with `limit=0`. Backfill creates Google Docs as your Google user through OAuth; the service account is still used by the normal sync job to read published Docs.

Required GitHub secrets:

```text
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_PUBLISH_FOLDER_ID
GOOGLE_DRAFTS_FOLDER_ID
GOOGLE_EDITOR_EMAIL
```

Additional GitHub secrets for the archive backfill:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
```

Create an OAuth client in Google Cloud, set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` locally, then run:

```sh
npm run google:oauth-token
```

Open the printed URL, approve access, and save the printed refresh token as `GOOGLE_OAUTH_REFRESH_TOKEN`.

Local commands use the same environment variables:

```sh
npm run sync:docs
npm run backfill:docs
```

`npm run backfill:docs` creates Google Docs from existing live posts and imported drafts. Set `BACKFILL_LIMIT=3` to test a small batch first.

## Deployment

Cloudflare Pages settings:

```text
Build command: npm run build
Output directory: dist
```

The site publishes posts at file-based URLs like `/2025/12/whats-your-name.html`.

## Admin

Pages CMS is intentionally disabled. Google Docs is the editor; Markdown files in this repo are generated site content.
