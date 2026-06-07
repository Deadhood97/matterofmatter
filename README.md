# Matter of Matter

Astro site for the migrated Matter of Matter blog.

## Commands

Run commands from this directory:

```sh
npm install
npm run migrate:blogger
npm run dev
npm run build
```

## Content

- Published posts live in `src/content/blog`.
- Imported Blogger images live in `public/images/blogger`.
- Imported drafts are generated into `drafts/`, which is ignored by Git by default so they are not exposed in a public repository.
- `migration-audit.json` records post counts, copied images, and any remote images that did not map to local Takeout files.

## Deployment

Cloudflare Pages settings:

```text
Build command: npm run build
Output directory: dist
```

The site preserves old Blogger post URLs like `/2025/12/whats-your-name.html`.

## Admin

`.pages.yml` configures Pages CMS for editing posts and media through a GitHub-backed admin UI.
