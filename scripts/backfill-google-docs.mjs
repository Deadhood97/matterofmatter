import {
  findDrafts,
  findPosts,
  getGoogleClients,
  htmlWithEmbeddedLocalImages,
  importHtmlAsGoogleDoc,
  requireEnv,
  shareFileWithEditor,
  writePost,
} from './google-docs-lib.mjs';

const publishFolderId = requireEnv('GOOGLE_PUBLISH_FOLDER_ID');
const draftsFolderId = requireEnv('GOOGLE_DRAFTS_FOLDER_ID');
const editorEmail = process.env.GOOGLE_EDITOR_EMAIL;
const limit = Number(process.env.BACKFILL_LIMIT ?? '0');
const { drive } = await getGoogleClients();

const livePosts = await findPosts();
const drafts = await findDrafts();
const candidates = [
  ...livePosts.map((post) => ({ ...post, targetFolderId: publishFolderId, publishable: true })),
  ...drafts.map((post) => ({ ...post, targetFolderId: draftsFolderId, publishable: false })),
].filter((post) => !post.data.googleDocId);
const selected = limit > 0 ? candidates.slice(0, limit) : candidates;

let backfilled = 0;

for (const post of selected) {
  const htmlBody = await htmlWithEmbeddedLocalImages(post.body);
  const html = [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"></head>',
    '<body>',
    htmlBody,
    '</body>',
    '</html>',
  ].join('\n');
  const doc = await importHtmlAsGoogleDoc(drive, {
    name: post.data.title ?? post.id,
    html,
    folderId: post.targetFolderId,
  });

  await shareFileWithEditor(drive, doc.id, editorEmail);

  if (post.publishable) {
    await writePost(
      post.filePath,
      {
        ...post.data,
        status: 'LIVE',
        source: 'google-docs',
        googleDocId: doc.id,
      },
      post.body,
    );
  }

  backfilled += 1;
  console.log(`Backfilled ${post.publishable ? 'post' : 'draft'}: ${post.data.title ?? post.id}`);
}

console.log(`Google Docs backfill complete. Backfilled ${backfilled}.`);
