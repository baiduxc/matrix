import { test } from "node:test";
import assert from "node:assert/strict";
import {
	archiveLocation,
	archivePath,
	countTags,
	searchArticles,
	ARCHIVE_PAGE_SIZE,
	HOME_PAGE_COUNT,
} from "../src/matrix/lib/article-browser.js";
const posts = [
	{
		id: "a",
		title: "AI Agent 架构",
		topic: "开发",
		description: "工程实践",
		tags: ["AI", "Agent", "AI"],
	},
	{
		id: "b",
		title: "网络入门",
		topic: "基础设施",
		description: "系统架构",
		tags: ["网络"],
	},
];
test("search is empty before input and matches all entered keywords across metadata", () => {
	assert.deepEqual(searchArticles(posts, "  "), []);
	assert.deepEqual(
		searchArticles(posts, "ai 开发").map((post) => post.id),
		["a"],
	);
	assert.deepEqual(searchArticles(posts, "网络 工程"), []);
});
test("archive page and tag survive URL navigation, including invalid page bounds", () => {
	assert.equal(ARCHIVE_PAGE_SIZE, 10);
	assert.equal(HOME_PAGE_COUNT, 3);
	assert.deepEqual(archiveLocation("?page=3", 445), { page: 3, tag: "" });
	assert.deepEqual(archiveLocation("?page=900", 445), { page: 45, tag: "" });
	for (const value of ["-2", "0", "NaN", "2.5"])
		assert.equal(archiveLocation(`?page=${value}`, 445).page, 1);
	const url = archivePath(3, "C++ / AI");
	assert.deepEqual(
		archiveLocation(new URL(url, "https://example.com").search, 445),
		{ page: 3, tag: "C++ / AI" },
	);
});
test("tag cloud counts articles, deduplicating tags within each article", () => {
	const tags = countTags(posts);
	assert.equal(tags.find((tag) => tag.name === "AI").count, 1);
	assert.equal(tags.length, 3);
});
