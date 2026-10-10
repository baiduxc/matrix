export const ARTICLE_CACHE_LIMIT = 8;
export function rememberArticle(cache, id, html) {
	cache.delete(id);
	cache.set(id, html);
	while (cache.size > ARTICLE_CACHE_LIMIT)
		cache.delete(cache.keys().next().value);
}
export function recallArticle(cache, id) {
	const html = cache.get(id);
	if (html !== undefined) {
		cache.delete(id);
		cache.set(id, html);
	}
	return html;
}
