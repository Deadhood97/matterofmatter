# Security Audit

Date: 2026-06-09
Repository: `Deadhood97/matterofmatter`

## Summary

The site is a static Astro blog with Google Docs import/backfill scripts and GitHub Actions automation. The audit found no dependency advisories and no committed secret values. The main risks were raw imported HTML, externally loaded post images, broad Google OAuth scopes, unpinned workflow actions, and loose GitHub repository settings.

## Findings

### High: Imported post HTML was not sanitized consistently

Raw Blogger and Google Docs HTML can be rendered by Astro Markdown. Existing posts contained legacy Blogger attributes such as inline styles, classes, and remote image references. No script tags or inline event handlers were present, but future imports could have preserved unsafe markup.

Status: Fixed.

Remediation:
- Added a shared HTML sanitizer in `scripts/google-docs-lib.mjs`.
- Applied it to Google Docs exports, copied Google Docs image HTML, and Blogger conversion.
- Sanitized the existing 20 published post files.
- Added a restrictive site-wide Content Security Policy in `src/layouts/BaseLayout.astro`.

### Medium: Published posts loaded a few external images

Three published image sources still depended on external hosts. That leaked visitor requests to third parties and conflicted with a strict `img-src 'self'` policy.

Status: Fixed.

Remediation:
- Localized the Reddit preview image into `public/images/blogger/reddit-3vexh8w3nw271.webp`.
- Repointed two Blogger image references to matching local Takeout files.
- Verified no published post image source points at `http://` or `https://`.

### Medium: Google OAuth scope was broader than required

The code requested Drive and Docs scopes, but the implementation uses Drive API operations only. Sync needs read-only Drive access; backfill needs file creation and sharing for app-created files.

Status: Partially fixed.

Remediation:
- Future OAuth token generation now requests `https://www.googleapis.com/auth/drive.file`.
- Service-account auth now requests `https://www.googleapis.com/auth/drive.readonly`.
- Removed the unused Google Docs API client construction.

Remaining action:
- Rotate `GOOGLE_OAUTH_REFRESH_TOKEN` once with `npm run google:oauth-token` so the saved token receives only the narrowed scope.

### Medium: GitHub Actions used mutable action tags

The workflows used `actions/checkout@v4` and `actions/setup-node@v4`, which are trusted but mutable tags.

Status: Fixed.

Remediation:
- Pinned both workflows to exact action commits:
  - `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5`
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`
- Restricted repository Actions settings to selected GitHub-owned actions.

### Low: Repository settings exposed unused features

The public repository had Wiki and Projects enabled even though the app does not use them.

Status: Fixed.

Remediation:
- Disabled Wiki.
- Disabled Projects.
- Kept Issues enabled.

### Low: Main branch lacked protection

The default branch had no protection. Requiring pull requests would break the current content-sync workflow, so the hardening was scoped to protections that do not block automated content commits.

Status: Fixed.

Remediation:
- Enabled branch protection for `main`.
- Required linear history.
- Disabled force pushes.
- Disabled branch deletion.

### Informational: Dependencies and static build

`npm audit` reported zero vulnerabilities. The Astro build output is static and generated 22 pages.

Status: Verified.

## Verification

Commands and checks run:

- `npm audit --json`
- Secret-pattern scan across tracked project files, excluding `.git`, `node_modules`, `dist`, and `package-lock.json`
- Unsafe content scan for scriptable tags, inline handlers, JavaScript URLs, legacy style/class/id attributes, and remote image sources
- `npm run build`
- GitHub API checks for repo features, Actions permissions, branch protection, and secret names

Results:

- Dependency vulnerabilities: 0 critical, 0 high, 0 moderate, 0 low.
- No committed secret values found.
- No unsafe rendered post HTML patterns found after sanitization.
- No remote post image sources found after localization.
- Static build completed successfully.
- GitHub Actions default workflow token remains read-only at repo level; write access is granted only in the workflows that commit generated content.

## Residual Risk

- The existing Google OAuth refresh token was created before the scope reduction. Rotate it once to fully apply the narrower `drive.file` scope.
- RSS absolute URLs depend on the final production host. If the site moves from GitHub Pages to a custom Cloudflare Pages domain, set `site` in `astro.config.mjs` to the final canonical URL.
- Google Drive folder sharing and Google Cloud OAuth app tester settings live outside this repository and should be reviewed periodically in Google Cloud/Drive.
