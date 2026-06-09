import { getCollection } from 'astro:content';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

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

export function postUrl(post: { id: string }) {
  return sitePath(`/${post.id.replace(/\\/g, '/')}.html`);
}

export function sitePath(path: string) {
  return `${basePath}${path}`;
}

export function readingTime(body = '') {
  const words = plainText(body).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));

  return `${minutes} min read`;
}

export function excerpt(body = '', maxLength = 180) {
  const text = plainText(body);

  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return `${truncated.slice(0, lastSpace > 80 ? lastSpace : maxLength).trim()}...`;
}

export function groupPostsByYear(posts: Awaited<ReturnType<typeof getLivePosts>>) {
  return posts.reduce<Array<{ year: number; posts: typeof posts }>>((groups, post) => {
    const year = post.data.published.getFullYear();
    const current = groups.find((group) => group.year === year);

    if (current) {
      current.posts.push(post);
    } else {
      groups.push({ year, posts: [post] });
    }

    return groups;
  }, []);
}

export function previousNextPosts(
  posts: Awaited<ReturnType<typeof getLivePosts>>,
  currentId: string,
) {
  const chronological = [...posts].sort(
    (a, b) => a.data.published.valueOf() - b.data.published.valueOf(),
  );
  const index = chronological.findIndex((post) => post.id === currentId);

  return {
    previous: index > 0 ? chronological[index - 1] : undefined,
    next: index >= 0 && index < chronological.length - 1 ? chronological[index + 1] : undefined,
  };
}

export function firstImage(body = '') {
  const match = body.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);

  return match?.[1]?.replace(/&amp;/g, '&');
}

function plainText(body = '') {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
