import { chatDefaults } from "./chat-service.mjs";
export function onRequest({ request, env = {} }) {
	return new Response(
		JSON.stringify(
			request.method === "GET"
				? {
						configured: Boolean(env.BAILIAN_API_KEY?.trim()),
						model: env.BAILIAN_CHAT_MODEL || chatDefaults.model,
					}
				: { message: "Method not allowed" },
		),
		{
			status: request.method === "GET" ? 200 : 405,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-store",
			},
		},
	);
}

export default onRequest;
