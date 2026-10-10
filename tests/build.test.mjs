import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { siteMeta } from "../src/matrix/config/site.js";
const available = fs.existsSync("dist/content/articles.json");
const catalog = available
	? JSON.parse(fs.readFileSync("dist/content/articles.json", "utf8"))
	: [];

test(
	"first paint shares the Matrix loader and hides SSR content",
	{ skip: !available },
	() => {
		for (const file of [
			"index.html",
			"archive/index.html",
			"about/index.html",
			"projects/index.html",
			...catalog.map((post) => path.join(post.url, "index.html")),
		]) {
			const html = parse(fs.readFileSync(path.join("dist", file), "utf8"));
			assert.ok(html.querySelector(".matrix-startup"));
			assert.ok(
				html.querySelector(".matrix-static-content").hasAttribute("hidden"),
			);
			assert.equal(html.querySelector(".matrix-fallback"), null);
			assert.ok(
				html
					.querySelectorAll("head style")
					.some((node) =>
						node.textContent.includes(
							".matrix-static-content[hidden]{display:none!important}",
						),
					),
			);
			assert.ok(
				html.querySelector("title").textContent.includes(siteMeta.title),
			);
			assert.ok(
				html
					.querySelector(".matrix-startup")
					.textContent.includes(siteMeta.brand),
			);
		}
	},
);

test(
	"catalog, article HTML, RSS and sitemap agree, including an empty collection",
	{ skip: !available },
	() => {
		const source = fs
			.readdirSync("src/content/posts", { recursive: true })
			.filter(
				(file) =>
					file.endsWith(".md") &&
					!/^draft:\s*true\s*$/m.test(
						fs.readFileSync(path.join("src/content/posts", file), "utf8"),
					),
			);
		assert.equal(catalog.length, source.length);
		const rss = parse(fs.readFileSync("dist/rss.xml", "utf8"));
		assert.equal(rss.querySelectorAll("item").length, catalog.length);
		const sitemap = fs.readFileSync("dist/sitemap-0.xml", "utf8");
		assert.ok(!sitemap.includes("/content/"));
		for (const post of catalog) {
			const data = JSON.parse(
				fs.readFileSync(path.join("dist", post.contentUrl), "utf8"),
			);
			assert.equal(data.id, post.id);
			assert.ok(data.html.length > 0);
			const html = parse(
				fs.readFileSync(path.join("dist", post.url, "index.html"), "utf8"),
			);
			const article = html.querySelector("article[data-pagefind-body]");
			assert.ok(article, `Missing SSR article: ${post.id}`);
			assert.equal(article.querySelector("h1").textContent, post.title);
			const credit = article.querySelector(".article-credit");
			assert.ok(credit);
			assert.equal(
				credit.querySelector(".credit-address").getAttribute("href"),
				post.sourceLink || new URL(post.url, siteMeta.url).href,
			);
			assert.ok(credit.textContent.includes(post.licenseName));
			assert.equal(
				html.querySelector('link[rel="canonical"]').getAttribute("href"),
				new URL(post.url, siteMeta.url).href,
			);
			assert.equal(
				JSON.parse(
					html.querySelector("[data-matrix-article-schema]").textContent,
				).headline,
				post.title,
			);
			if (post.image?.startsWith("/"))
				assert.ok(fs.existsSync(path.join("dist", post.image)));
			assert.ok(sitemap.includes(post.url));
			assert.ok(!("body" in post));
		}
	},
);
