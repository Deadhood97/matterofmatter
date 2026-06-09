import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

export const BLOG_DIR = path.resolve('src/content/blog');
export const DRAFTS_DIR = path.resolve('drafts');
export const DOC_IMAGE_DIR = path.resolve('public/images/docs');
export const SITE_BASE_PATH = normalizeBasePath(process.env.SITE_BASE_PATH ?? '/matterofmatter');

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const HTML_ZIP_MIME = 'application/zip';

export function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function getGoogleClients(options = {}) {
  const auth = await getGoogleAuth(options);

  return {
    drive: google.drive({ version: 'v3', auth }),
  };
}

export async function getGoogleAuth(options = {}) {
  const authMode = options.authMode ?? process.env.GOOGLE_AUTH_MODE;
  const hasOAuthToken = Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
  const scopes = authMode === 'oauth' || hasOAuthToken
    ? ['https://www.googleapis.com/auth/drive.file']
    : ['https://www.googleapis.com/auth/drive.readonly'];

  if (authMode === 'oauth' || hasOAuthToken) {
    const auth = new google.auth.OAuth2(
      requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
      requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    );

    auth.setCredentials({
      refresh_token: requireEnv('GOOGLE_OAUTH_REFRESH_TOKEN'),
    });

    return auth;
  }

  const rawCredentials = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(rawCredentials);
  return new google.auth.GoogleAuth({
    credentials,
    scopes,
  });
}

export async function listDocsInFolder(drive, folderId) {
  const files = [];
  let pageToken;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='${GOOGLE_DOC_MIME}' and trashed=false`,
      fields: 'nextPageToken, files(id, name, modifiedTime, createdTime)',
      orderBy: 'createdTime',
      pageToken,
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return files;
}

export async function exportDocAsZip(drive, fileId) {
  const response = await drive.files.export(
    {
      fileId,
      mimeType: HTML_ZIP_MIME,
    },
    { responseType: 'arraybuffer' },
  );

  return Buffer.from(response.data);
}

export function extractHtmlZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const htmlEntry = entries.find((entry) => entry.entryName.toLowerCase().endsWith('.html'));

  if (!htmlEntry) {
    throw new Error('Google Docs export did not include an HTML file.');
  }

  const assets = new Map();
  for (const entry of entries) {
    if (entry.isDirectory || entry === htmlEntry) {
      continue;
    }

    assets.set(entry.entryName.replace(/\\/g, '/'), entry.getData());
  }

  return {
    html: htmlEntry.getData().toString('utf8'),
    assets,
  };
}

export function cleanGoogleHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const body = $('body').length ? $('body') : $.root();

  body.find('script, style, meta, link').remove();
  body.find('*').each((_, element) => {
    const node = $(element);
    const tagName = element.tagName?.toLowerCase();

    node.removeAttr('class');
    node.removeAttr('id');
    node.removeAttr('style');
    node.removeAttr('dir');
    node.removeAttr('start');

    if (tagName === 'span') {
      node.replaceWith(node.contents());
    }
  });

  return sanitizeHtmlFragment(body.html()?.trim() ?? '');
}

export function sanitizeHtmlFragment(html) {
  const $ = cheerio.load(`<main>${html}</main>`, { decodeEntities: false });
  const dangerousTags = 'script, style, iframe, object, embed, form, input, button, textarea, select, option, meta, link, base, svg, math';
  const allowedTags = new Set([
    'a',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'figcaption',
    'figure',
    'h2',
    'h3',
    'h4',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ]);

  $('main').find(dangerousTags).remove();

  $('main').find('*').each((_, element) => {
    const node = $(element);
    const tagName = element.tagName?.toLowerCase();

    if (!allowedTags.has(tagName)) {
      node.replaceWith(node.contents());
      return;
    }

    for (const attribute of Object.keys(element.attribs ?? {})) {
      if (!isAllowedAttribute(tagName, attribute)) {
        node.removeAttr(attribute);
      }
    }

    if (tagName === 'a') {
      const href = node.attr('href');

      if (!href || !isSafeLinkUrl(href)) {
        node.removeAttr('href');
      } else if (/^https?:\/\//i.test(href)) {
        node.attr('rel', 'noopener noreferrer');
      }
    }

    if (tagName === 'img') {
      const src = node.attr('src');

      if (!src || !isSafeImageUrl(src)) {
        node.remove();
        return;
      }

      if (!node.attr('alt')) {
        node.attr('alt', '');
      }

      node.attr('loading', 'lazy');
      node.attr('decoding', 'async');
    }
  });

  return $('main').html()?.trim() ?? '';
}

export async function copyExportedImages(html, assets, imageDir, publicBase) {
  await fs.mkdir(imageDir, { recursive: true });
  const $ = cheerio.load(`<main>${html}</main>`, { decodeEntities: false });

  for (const img of $('img').toArray()) {
    const node = $(img);
    const src = node.attr('src');

    if (!src) {
      continue;
    }

    const key = decodeURIComponent(src).replace(/^\.\//, '').replace(/\\/g, '/');
    const asset = assets.get(key) ?? assets.get(key.replace(/^images\//, ''));

    if (!asset) {
      continue;
    }

    const filename = safeAssetName(path.basename(key));
    await fs.writeFile(path.join(imageDir, filename), asset);
    node.attr('src', `${publicBase}/${encodeURIComponent(filename)}`);
  }

  return sanitizeHtmlFragment($('main').html()?.trim() ?? html);
}

export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return { data: {}, body: raw };
  }

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const lineMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (!lineMatch) {
      continue;
    }

    const [, key, rawValue] = lineMatch;
    data[key] = parseYamlValue(rawValue);
  }

  return {
    data,
    body: raw.slice(match[0].length),
  };
}

export function renderFrontmatter(data) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  lines.push('---', '');
  return lines.join('\n');
}

export async function findPosts() {
  const files = await walkMarkdown(BLOG_DIR);
  const posts = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const id = path.relative(BLOG_DIR, filePath).replace(/\\/g, '/').replace(/\.md$/, '');

    posts.push({ filePath, id, data, body, raw });
  }

  return posts;
}

export async function findDrafts() {
  try {
    const files = await walkMarkdown(DRAFTS_DIR);
    const drafts = [];

    for (const filePath of files) {
      const raw = await fs.readFile(filePath, 'utf8');
      const { data, body } = parseFrontmatter(raw);
      const id = path.relative(DRAFTS_DIR, filePath).replace(/\\/g, '/').replace(/\.md$/, '');

      drafts.push({ filePath, id, data, body, raw });
    }

    return drafts;
  } catch {
    return [];
  }
}

export async function writePost(filePath, data, body) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${renderFrontmatter(data)}${body.trim()}\n`, 'utf8');
}

export function slugify(value, fallback = 'untitled') {
  return (value || fallback)
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

export function postPathForDate(date, slug) {
  const parsed = new Date(date);
  const year = String(parsed.getUTCFullYear());
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');

  return path.join(BLOG_DIR, year, month, `${slug}.md`);
}

export function imagePathsForPost(postId) {
  const parts = postId.split('/');
  const slug = parts.pop();
  const year = parts[0];
  const month = parts[1];
  const imageDir = path.join(DOC_IMAGE_DIR, year, month, slug);
  const publicBase = sitePath(`/images/docs/${year}/${month}/${slug}`);

  return { imageDir, publicBase };
}

export async function uniquePostPath(date, slug) {
  let candidate = postPathForDate(date, slug);
  let index = 2;

  while (await exists(candidate)) {
    candidate = postPathForDate(date, `${slug}-${index}`);
    index += 1;
  }

  return candidate;
}

export async function importHtmlAsGoogleDoc(drive, { name, html, folderId }) {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: GOOGLE_DOC_MIME,
      parents: [folderId],
    },
    media: {
      mimeType: 'text/html',
      body: html,
    },
    fields: 'id, name',
    supportsAllDrives: true,
  });

  return response.data;
}

export async function shareFileWithEditor(drive, fileId, emailAddress) {
  if (!emailAddress) {
    return;
  }

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'user',
      role: 'writer',
      emailAddress,
    },
    sendNotificationEmail: false,
    supportsAllDrives: true,
  });
}

export async function htmlWithEmbeddedLocalImages(body) {
  const $ = cheerio.load(`<main>${body}</main>`, { decodeEntities: false });

  for (const img of $('img').toArray()) {
    const node = $(img);
    const src = node.attr('src');

    if (!src || /^https?:\/\//i.test(src) || src.startsWith('data:')) {
      continue;
    }

    const publicPath = src.startsWith(`${SITE_BASE_PATH}/`)
      ? src.slice(SITE_BASE_PATH.length + 1)
      : src.replace(/^\//, '');
    const localPath = path.resolve('public', publicPath);

    try {
      const bytes = await fs.readFile(localPath);
      const mime = mimeFromPath(localPath);
      node.attr('src', `data:${mime};base64,${bytes.toString('base64')}`);
    } catch {
      // Keep the original src if the local file is missing.
    }
  }

  return $('main').html() ?? body;
}

async function walkMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseYamlValue(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed === '[]') {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^"|"$/g, '');
  }
}

function isAllowedAttribute(tagName, attribute) {
  const name = attribute.toLowerCase();

  if (name.startsWith('on')) {
    return false;
  }

  if (tagName === 'a') {
    return ['href', 'title', 'rel'].includes(name);
  }

  if (tagName === 'img') {
    return ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'].includes(name);
  }

  return false;
}

function isSafeLinkUrl(value) {
  const normalized = value.trim().replace(/&amp;/g, '&');

  if (/[\u0000-\u001F\u007F]/.test(normalized)) {
    return false;
  }

  return /^(https?:\/\/|mailto:|\/|#)/i.test(normalized);
}

function isSafeImageUrl(value) {
  const normalized = value.trim().replace(/&amp;/g, '&');

  if (/[\u0000-\u001F\u007F]/.test(normalized)) {
    return false;
  }

  return normalized.startsWith('/images/')
    || normalized.startsWith(`${SITE_BASE_PATH}/images/`)
    || /^data:image\/(png|gif|jpe?g|webp);base64,/i.test(normalized);
}

function safeAssetName(value) {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
}

function normalizeBasePath(value) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === '/') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function sitePath(value) {
  return `${SITE_BASE_PATH}${value}`;
}

function mimeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.png') return 'image/png';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}
