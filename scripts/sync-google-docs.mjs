import path from 'node:path';
import {
  BLOG_DIR,
  cleanGoogleHtml,
  copyExportedImages,
  exportDocAsZip,
  extractHtmlZip,
  findPosts,
  getGoogleClients,
  imagePathsForPost,
  listDocsInFolder,
  requireEnv,
  slugify,
  uniquePostPath,
  writePost,
} from './google-docs-lib.mjs';

const publishFolderId = requireEnv('GOOGLE_PUBLISH_FOLDER_ID');
const { drive } = await getGoogleClients();
const docs = await listDocsInFolder(drive, publishFolderId);
const existingPosts = await findPosts();
const byGoogleDocId = new Map(
  existingPosts
    .filter((post) => post.data.googleDocId)
    .map((post) => [post.data.googleDocId, post]),
);

let created = 0;
let updated = 0;

for (const doc of docs) {
  const matchedPost = byGoogleDocId.get(doc.id);
  const firstSyncDate = new Date().toISOString();
  const filePath = matchedPost
    ? matchedPost.filePath
    : await uniquePostPath(firstSyncDate, slugify(doc.name));
  const postId = path.relative(BLOG_DIR, filePath).replace(/\\/g, '/').replace(/\.md$/, '');
  const { imageDir, publicBase } = imagePathsForPost(postId);
  const zipBuffer = await exportDocAsZip(drive, doc.id);
  const { html, assets } = extractHtmlZip(zipBuffer);
  const cleanedHtml = cleanGoogleHtml(html);
  const body = await copyExportedImages(cleanedHtml, assets, imageDir, publicBase);

  const previous = matchedPost?.data ?? {};
  const data = {
    title: doc.name,
    published: previous.published ?? firstSyncDate,
    updated: doc.modifiedTime ?? firstSyncDate,
    author: previous.author ?? 'ddHd',
    status: 'LIVE',
    source: 'google-docs',
    googleDocId: doc.id,
    labels: previous.labels ?? [],
    description: previous.description ?? '',
  };

  await writePost(filePath, data, body);

  if (matchedPost) {
    updated += 1;
  } else {
    created += 1;
  }
}

console.log(`Google Docs sync complete. Created ${created}, updated ${updated}.`);
