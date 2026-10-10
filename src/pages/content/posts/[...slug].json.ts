import { getMatrixPosts, getArticleHTML } from "../../../lib/matrix-content";
import type { APIRoute } from "astro";
export async function getStaticPaths() {
	return (await getMatrixPosts()).map((post) => ({
		params: { slug: post.slug },
		props: { post },
	}));
}
export const GET: APIRoute = async ({ props }) =>
	new Response(
		JSON.stringify({
			id: props.post.slug,
			html: await getArticleHTML(props.post),
		}),
		{
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"X-Robots-Tag": "noindex",
			},
		},
	);
