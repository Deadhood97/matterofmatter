import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sanitizeHtmlFragment, SITE_BASE_PATH } from './google-docs-lib.mjs';

const root = path.resolve('..');
const feedPath = path.join(root, 'takeout-extracted', 'Takeout', 'Blogger', 'Blogs', 'Matter of Matter', 'feed.atom');
const albumPath = path.join(root, 'takeout-extracted', 'Takeout', 'Blogger', 'Albums', 'Matter of Matter');
const blogOut = path.resolve('src', 'content', 'blog');
const draftOut = path.resolve('drafts');
const imageOut = path.resolve('public', 'images', 'blogger');
const auditOut = path.resolve('migration-audit.json');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
});

function array(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return value['#text'] ?? '';
}

function yamlString(value) {
  return JSON.stringify(value ?? '');
}

function slugify(value, fallback = 'untitled') {
  return (value || fallback)
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function fileBaseFromUrl(src) {
  try {
    const url = new URL(src.replace(/&amp;/g, '&'));
    const name = path.basename(decodeURIComponent(url.pathname));
    return name || null;
  } catch {
    return null;
  }
}

function entryFilename(entry, index) {
  const published = text(entry.published) || text(entry['blogger:created']) || new Date().toISOString();
  const date = new Date(published);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const bloggerPath = text(entry['blogger:filename']);
  const fromPath = bloggerPath ? path.basename(bloggerPath, '.html') : '';
  const titleSlug = slugify(text(entry.title), `untitled-${index + 1}`);
  return {
    year,
    month,
    slug: fromPath || titleSlug,
  };
}

async function copyAlbumImages() {
  await fs.mkdir(imageOut, { recursive: true });
  const files = await fs.readdir(albumPath);
  const imageFiles = files.filter((file) => !file.endsWith('.json') && file !== 'metadata.json');
  const byLowerName = new Map();

  for (const file of imageFiles) {
    await fs.copyFile(path.join(albumPath, file), path.join(imageOut, file));
    byLowerName.set(file.toLowerCase(), file);
  }

  return byLowerName;
}

function rewriteImages(html, imageMap, auditEntry) {
  return html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, before, src, after) => {
    const base = fileBaseFromUrl(src);

    if (!base) {
      auditEntry.unmatchedImages.push(src);
      return match;
    }

    const localName = imageMap.get(base.toLowerCase());
    if (!localName) {
      auditEntry.unmatchedImages.push(src);
      return match;
    }

    const localSrc = `${SITE_BASE_PATH}/images/blogger/${encodeURI(localName)}`;
    auditEntry.matchedImages.push({ from: src, to: localSrc });
    return `${before}${localSrc}${after}`;
  });
}

function frontmatter(entry, status) {
  const author = text(entry.author?.name) || 'ddHd';
  const labels = array(entry.category)
    .map((category) => text(category['@_term'] ?? category.term ?? category))
    .filter(Boolean);
  const description = text(entry['blogger:metaDescription']);

  return [
    '---',
    `title: ${yamlString(text(entry.title) || 'Untitled')}`,
    `published: ${yamlString(text(entry.published))}`,
    `updated: ${yamlString(text(entry.updated))}`,
    `author: ${yamlString(author)}`,
    `status: ${yamlString(status)}`,
    `labels: ${JSON.stringify(labels)}`,
    ...(description ? [`description: ${yamlString(description)}`] : []),
    '---',
    '',
  ].join('\n');
}

async function emptyDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

const xml = await fs.readFile(feedPath, 'utf8');
const feed = parser.parse(xml).feed;
const entries = array(feed.entry).filter((entry) => text(entry['blogger:type']) === 'POST');
const imageMap = await copyAlbumImages();

await emptyDir(blogOut);
await emptyDir(draftOut);

const audit = {
  source: feedPath,
  live: 0,
  drafts: 0,
  copiedImages: imageMap.size,
  entries: [],
};

for (const [index, entry] of entries.entries()) {
  const status = text(entry['blogger:status']) || 'DRAFT';
  const title = text(entry.title) || 'Untitled';
  const content = text(entry.content);
  const { year, month, slug } = entryFilename(entry, index);
  const bloggerPath = text(entry['blogger:filename']) || `/drafts/${year}/${month}/${slug}.html`;
  const auditEntry = {
    status,
    title,
    published: text(entry.published),
    bloggerPath,
    contentLength: content.length,
    matchedImages: [],
    unmatchedImages: [],
  };
  const body = sanitizeHtmlFragment(rewriteImages(content, imageMap, auditEntry));
  const outputBase = status === 'LIVE' ? blogOut : draftOut;
  const outputPath = path.join(outputBase, year, month, `${slug}.md`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${frontmatter(entry, status)}${body}\n`, 'utf8');

  if (status === 'LIVE') audit.live += 1;
  if (status === 'DRAFT') audit.drafts += 1;
  audit.entries.push(auditEntry);
}

await fs.writeFile(auditOut, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

console.log(`Converted ${audit.live} live posts and ${audit.drafts} drafts.`);
console.log(`Copied ${audit.copiedImages} image files.`);
console.log(`Wrote ${auditOut}.`);
