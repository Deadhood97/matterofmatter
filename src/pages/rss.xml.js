import rss from '@astrojs/rss';
import { getLivePosts } from '../lib/posts';

export async function GET(context) {
  const posts = await getLivePosts();

  return rss({
    title: 'Matter of Matter',
    description: 'Personal essays from Matter of Matter.',
    site: context.site ?? 'https://deadhood97.github.io/matterofmatter',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.published,
      description: post.data.description,
      link: post.data.bloggerPath,
    })),
  });
}
