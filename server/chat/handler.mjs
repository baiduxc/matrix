import { openChat, safeError } from "./chat-service.mjs";
const json = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
async function readInput(request) {
	if (!request.headers.get("content-type")?.includes("application/json"))
		return null;
	const reader = request.body?.getReader();
	if (!reader) return null;
	const decoder = new TextDecoder();
	let size = 0,
		text = "";
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > 73728) {
				await reader.cancel();
				throw new Error("Input too large");
			}
			text += decoder.decode(chunk.value, { stream: true });
		}
		return JSON.parse(text + decoder.decode());
	} finally {
		reader.releaseLock();
	}
}
export async function onRequest(context) {
	const { request, env = {} } = context;
	if (request.method !== "POST")
		return json({ message: "Method not allowed" }, 405);
	const origin = request.headers.get("origin");
	if (origin && origin !== new URL(request.url).origin)
		return json({ message: "不允许跨站调用" }, 403);
	let input;
	try {
		input = await readInput(request);
	} catch {
		return json({ code: "CHAT_JSON", message: "请求格式或长度有误" }, 400);
	}
	try {
		const reply = await openChat(
			env,
			input,
			request.signal,
			context.fetchImpl || fetch,
		);
		const encoder = new TextEncoder();
		const iterator = reply.events();
		const stream = new ReadableStream({
			async pull(controller) {
				try {
					const next = await iterator.next();
					if (next.done) controller.close();
					else
						controller.enqueue(
							encoder.encode(
								`event: ${next.value.event}\ndata: ${JSON.stringify(next.value.data)}\n\n`,
							),
						);
				} catch {
					controller.close();
					reply.cancel();
				}
			},
			async cancel() {
				reply.cancel();
				await iterator.return?.();
			},
		});
		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream; charset=utf-8",
				"Cache-Control": "no-cache, no-transform",
				"X-Accel-Buffering": "no",
			},
		});
	} catch (error) {
		const failure = safeError(error, request.signal);
		return json(
			{ code: failure.code, message: failure.message },
			failure.status,
		);
	}
}

export default onRequest;
