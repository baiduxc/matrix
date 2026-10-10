import type { APIRoute } from "astro";
import { siteMeta } from "../matrix/config/site.js";
export const GET: APIRoute = ({ site }) =>
	new Response(
		`User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap-index.xml", site || siteMeta.url).href}\n`,
		{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
	);
