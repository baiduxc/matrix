import { readEventStream } from "../../src/matrix/lib/event-stream.js";
import { ChatError } from "./chat-errors.mjs";
import { resolveChatConfig } from "./providers.mjs";
const system =
	"你是技术博客的矩阵助手，擅长 AI、技术开发和系统设计。默认用简洁清晰的中文回答，代码使用带语言标记的 Markdown 代码块。承认不确定性，不假装访问实时信息、执行代码或了解未提供的博客文章。";
export function validateInput(input) {
	if (
		!input ||
		typeof input.message !== "string" ||
		Object.keys(input).some((key) => !["message", "history"].includes(key))
	)
		throw new ChatError(400, "CHAT_INPUT", "请输入一个问题");
	const message = input.message.trim();
	if (!message || message.length > 2000)
		throw new ChatError(400, "CHAT_LENGTH", "问题需要在 1—2000 字符以内");
	const history = input.history || [];
	if (
		!Array.isArray(history) ||
		history.length > 16 ||
		history.length % 2 ||
		history.some(
			(item, index) =>
				!item ||
				item.role !== (index % 2 ? "assistant" : "user") ||
				typeof item.content !== "string" ||
				!item.content.trim() ||
				item.content.length > 14000,
		) ||
		history.reduce((sum, item) => sum + item.content.length, 0) > 16000
	)
		throw new ChatError(
			400,
			"CHAT_HISTORY",
			"历史对话格式或长度有误，请刷新对话",
		);
	return {
		message,
		history: history.map(({ role, content }) => ({ role, content })),
	};
}
export function safeError(error, signal) {
	if (error instanceof ChatError) return error;
	if (signal?.aborted)
		return new ChatError(499, "CHAT_CANCELLED", "对话已停止");
	return new ChatError(502, "CHAT_CONNECTION", "助手连接中断，请稍后再试");
}
export async function openChat(env, input, signal, fetchImpl = fetch) {
	const { message, history } = validateInput(input);
	const config = resolveChatConfig(env);
	if (!config.configured)
		throw new ChatError(
			503,
			"CHAT_NOT_CONFIGURED",
			"助手暂未连接，请配置 API Key、模型和接口地址",
		);
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	const timeout = setTimeout(abort, 90000);
	const cleanup = () => {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abort);
		controller.abort();
	};
	let upstream;
	try {
		if (signal?.aborted)
			throw new ChatError(499, "CHAT_CANCELLED", "对话已停止");
		upstream = await fetchImpl(config.endpoint, {
			method: "POST",
			redirect: "error",
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify({
				model: config.model,
				messages: [
					{ role: "system", content: system },
					...history,
					{ role: "user", content: message },
				],
				stream: true,
				...config.extraBody,
				[config.tokenParameter]: config.maxTokens,
			}),
		});
		if (
			!upstream.ok ||
			!upstream.body ||
			!upstream.headers.get("content-type")?.includes("text/event-stream")
		) {
			void upstream.body?.cancel().catch(() => {});
			if (upstream.status === 401)
				throw new ChatError(
					502,
					"CHAT_AUTH",
					"API Key 无效或已失效，请检查服务商配置",
				);
			if (upstream.status === 403)
				throw new ChatError(
					502,
					"CHAT_PERMISSION",
					"当前 API Key 没有此模型的使用权限，请检查套餐",
				);
			if (upstream.status === 429)
				throw new ChatError(
					429,
					"CHAT_PROVIDER_LIMIT",
					"模型服务繁忙或额度不足，请稍后再试",
				);
			throw new ChatError(502, "CHAT_UPSTREAM", "助手连接失败，请稍后再试");
		}
	} catch (error) {
		cleanup();
		throw safeError(error, signal);
	}
	return {
		cancel: cleanup,
		async *events() {
			let length = 0,
				finishSeen = false;
			try {
				for await (const frame of readEventStream(upstream.body)) {
					if (controller.signal.aborted) throw new Error("Aborted");
					if (frame.data === "[DONE]") {
						finishSeen = true;
						break;
					}
					let chunk;
					try {
						chunk = JSON.parse(frame.data);
					} catch {
						throw new ChatError(502, "CHAT_STREAM", "回复连接异常");
					}
					if (chunk.error)
						throw new ChatError(502, "CHAT_STREAM", "模型未能完成回复");
					const choice = chunk.choices?.[0];
					if (choice?.finish_reason) finishSeen = true;
					const source = choice?.delta?.content;
					if (typeof source !== "string") continue;
					const text = source.slice(0, 14000 - length);
					length += text.length;
					if (text) yield { event: "delta", data: { text } };
					if (length >= 14000) {
						finishSeen = true;
						break;
					}
				}
				if (!finishSeen)
					throw new ChatError(
						502,
						"CHAT_INTERRUPTED",
						"回复中断，可以继续提问",
					);
				yield { event: "done", data: { complete: true } };
			} catch (error) {
				if (!signal?.aborted)
					yield {
						event: "error",
						data: {
							code: safeError(error, signal).code,
							message: safeError(error, signal).message,
						},
					};
			} finally {
				cleanup();
			}
		},
	};
}
