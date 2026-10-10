import { getMatrixPosts, postMeta } from "../../lib/matrix-content";
export async function GET() {
	return new Response(JSON.stringify((await getMatrixPosts()).map(postMeta)), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"X-Robots-Tag": "noindex",
		},
	});
}
