export const ARCHIVE_PAGE_SIZE = 10;
export const HOME_PAGE_COUNT = 3;
export function archiveLocation(search, total) {
	const params = new URLSearchParams(search);
	const page = Number(params.get("page"));
	return {
		page: Math.max(
			1,
			Math.min(
				Math.ceil(total / ARCHIVE_PAGE_SIZE) || 1,
				Number.isInteger(page) ? page : 1,
			),
		),
		tag: params.get("tag") || "",
	};
}
export function archivePath(page = 1, tag = "") {
	const params = new URLSearchParams();
	if (page > 1) params.set("page", String(page));
	if (tag) params.set("tag", tag);
	return `/archive/${params.size ? `?${params}` : ""}`;
}
export function searchArticles(posts, query) {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.length) return [];
	return posts.filter((post) => {
		const text =
			`${post.title} ${post.topic} ${post.description} ${post.tags.join(" ")}`.toLowerCase();
		return terms.every((term) => text.includes(term));
	});
}
export function countTags(posts) {
	const counts = new Map();
	for (const post of posts)
		for (const tag of new Set(post.tags))
			counts.set(tag, (counts.get(tag) || 0) + 1);
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
