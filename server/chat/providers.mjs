import { ChatError } from "./chat-errors.mjs";

// Server-only presets. Browser input can never select an endpoint or credential.
export const chatProviders = {
	bailian: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
	volcengine: { baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
	deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
	openai: {
		baseUrl: "https://api.openai.com/v1",
		tokenParameter: "max_completion_tokens",
	},
	gemini: {
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
	},
	custom: {},
	// Compatibility for existing installations using BAILIAN_* variables.
	"bailian-token-plan": {
		baseUrl:
			"https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
		model: "deepseek-v4.1-flash",
		extraBody: { enable_thinking: false },
	},
};
const text = (value) => (typeof value === "string" ? value.trim() : "");
const invalid = () => new ChatError(503, "CHAT_CONFIG", "助手接口配置有误");

export function resolveChatConfig(env = {}) {
	const provider =
		text(env.CHAT_PROVIDER).toLowerCase() ||
		(text(env.BAILIAN_API_KEY) && !text(env.CHAT_API_KEY)
			? "bailian-token-plan"
			: "bailian");
	if (!Object.hasOwn(chatProviders, provider)) throw invalid();
	const preset = chatProviders[provider];
	const legacy = provider === "bailian-token-plan";
	const apiKey =
		text(env.CHAT_API_KEY) || (legacy ? text(env.BAILIAN_API_KEY) : "");
	const model =
		text(env.CHAT_MODEL) ||
		(legacy ? text(env.BAILIAN_CHAT_MODEL) : "") ||
		preset.model ||
		"";
	const baseUrl =
		text(env.CHAT_BASE_URL) ||
		(legacy ? text(env.BAILIAN_CHAT_BASE_URL) : "") ||
		preset.baseUrl ||
		"";
	let endpoint = "";
	if (baseUrl) {
		let url;
		try {
			url = new URL(baseUrl);
		} catch {
			throw invalid();
		}
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw invalid();
		const path = url.pathname.replace(/\/+$/, "");
		url.pathname = path.endsWith("/chat/completions")
			? path
			: `${path}/chat/completions`;
		endpoint = url.href;
	}
	const tokenParameter =
		text(env.CHAT_TOKEN_PARAMETER) || preset.tokenParameter || "max_tokens";
	if (!["max_tokens", "max_completion_tokens"].includes(tokenParameter))
		throw invalid();
	const maxTokens = text(env.CHAT_MAX_TOKENS)
		? Number(env.CHAT_MAX_TOKENS)
		: 1500;
	if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 8192)
		throw invalid();
	return {
		provider,
		apiKey,
		model,
		endpoint,
		tokenParameter,
		maxTokens,
		extraBody: preset.extraBody || {},
		configured: Boolean(apiKey && model && endpoint),
	};
}
