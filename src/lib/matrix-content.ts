import { getCollection, type CollectionEntry } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import fs from "node:fs";
import { siteMeta } from "../matrix/config/site.js";
const htmlCache = new Map<string, Promise<string>>();
export async function getMatrixPosts() {
	// An empty template is intentional; avoid Astro's missing-collection warning.
	if (
		!fs.existsSync("src/content/posts") ||
		!fs
			.readdirSync("src/content/posts", { recursive: true })
			.some((file: unknown) => String(file).endsWith(".md"))
	)
		return [];
	return (await getCollection("posts", ({ data }) => !data.draft)).sort(
		(a, b) =>
			Number(b.data.pinned) - Number(a.data.pinned) ||
			b.data.published.valueOf() - a.data.published.valueOf(),
	);
}
export function postMeta(post: CollectionEntry<"posts">) {
	const data = post.data;
	return {
		id: post.slug,
		url: `/posts/${post.slug}/`,
		contentUrl: `/content/posts/${post.slug}.json`,
		title: data.title,
		short: data.title,
		description: data.description || data.title,
		image: fs.existsSync(`public/assets/matrix/covers/${post.slug}.webp`)
			? `/assets/matrix/covers/${post.slug}.webp`
			: data.image || null,
		topic: data.category || data.tags[0] || "技术随笔",
		tags: data.tags,
		author: data.author || siteMeta.owner,
		sourceLink: data.sourceLink,
		licenseName: data.licenseName || siteMeta.articleLicense.name,
		licenseUrl: data.licenseName
			? data.licenseUrl
			: siteMeta.articleLicense.url,
		date: data.published.toISOString().slice(0, 10),
		updated: (data.updated || data.published).toISOString(),
	};
}
export async function getArticleHTML(post: CollectionEntry<"posts">) {
	if (!htmlCache.has(post.slug))
		htmlCache.set(
			post.slug,
			(async () => {
				const { Content } = await post.render();
				const container = await AstroContainer.create();
				return container.renderToString(Content);
			})(),
		);
	return htmlCache.get(post.slug)!;
}
