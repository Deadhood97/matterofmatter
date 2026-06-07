import { getCollection } from 'astro:content';

export async function getLivePosts() {
  const posts = await getCollection('blog', ({ data }) => data.status === 'LIVE');

  return posts.sort(
    (a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
