import { resolveChatConfig } from "./providers.mjs";
export function onRequest({ request, env = {} }) {
	let data = { message: "Method not allowed" };
	if (request.method === "GET") {
		try {
			const config = resolveChatConfig(env);
			data = { configured: config.configured, model: config.model };
		} catch {
			data = { configured: false, model: "" };
		}
	}
	return new Response(JSON.stringify(data), {
		status: request.method === "GET" ? 200 : 405,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}
export default onRequest;
