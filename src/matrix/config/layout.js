// Keep a full row of covers at each desktop width.
export function getArticleColumns(width) {
	if (width >= 1800) return 8;
	if (width >= 1500) return 7;
	if (width >= 1200) return 6;
	if (width >= 1000) return 5;
	if (width >= 700) return 4;
	return 2;
}
