import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChatConfig } from "../server/chat/providers.mjs";
import { onRequest as chat } from "../edge-functions/api/chat/index.js";
import { onRequest as status } from "../edge-functions/api/chat/status.js";
import { readEventStream } from "../src/matrix/lib/event-stream.js";

const endpoints = {
	bailian: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
	volcengine: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
	deepseek: "https://api.deepseek.com/chat/completions",
	openai: "https://api.openai.com/v1/chat/completions",
	gemini:
		"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
	custom: "https://gateway.example/v1/chat/completions",
};
for (const [provider, endpoint] of Object.entries(endpoints)) {
	test(`${provider} sends correct endpoint, authentication and provider-specific payload, then streams`, async () => {
		const env = {
			CHAT_PROVIDER: provider,
			CHAT_API_KEY: "private-provider-key",
			CHAT_MODEL: "account-model",
			...(provider === "custom"
				? { CHAT_BASE_URL: "https://gateway.example/v1/" }
				: {}),
		};
		let calls = 0;
		const response = await chat({
			request: new Request("https://example.com/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: "你好" }),
			}),
			env,
			fetchImpl: async (url, init) => {
				calls++;
				assert.equal(url, endpoint);
				assert.equal(init.headers.Authorization, `Bearer ${env.CHAT_API_KEY}`);
				const payload = JSON.parse(init.body);
				assert.equal(payload.model, env.CHAT_MODEL);
				assert.equal(payload.stream, true);
				assert.ok(!("enable_thinking" in payload));
				assert.equal(
					payload[
						provider === "openai" ? "max_completion_tokens" : "max_tokens"
					],
					1500,
				);
				assert.equal(
					payload[
						provider === "openai" ? "max_tokens" : "max_completion_tokens"
					],
					undefined,
				);
				return new Response(
					'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
					{ headers: { "Content-Type": "text/event-stream" } },
				);
			},
		});
		assert.equal(response.status, 200);
		const events = [];
		for await (const frame of readEventStream(response.body))
			events.push({ event: frame.event, data: JSON.parse(frame.data) });
		assert.equal(calls, 1);
		assert.deepEqual(
			events.map((frame) => frame.event),
			["delta", "done"],
		);
		assert.equal(events[0].data.text, "Hello");
		assert.ok(!JSON.stringify(events).includes(env.CHAT_API_KEY));
	});
}

test("custom endpoint normalization avoids duplicate suffixes and supports token overrides", () => {
	for (const base of [
		"https://gateway.example/v1",
		"https://gateway.example/v1/",
		"https://gateway.example/v1/chat/completions",
		"https://gateway.example/v1/chat/completions/",
	]) {
		const config = resolveChatConfig({
			CHAT_PROVIDER: "custom",
			CHAT_API_KEY: "private",
			CHAT_MODEL: "model",
			CHAT_BASE_URL: base,
			CHAT_MAX_TOKENS: "4096",
			CHAT_TOKEN_PARAMETER: "max_completion_tokens",
		});
		assert.equal(config.endpoint, endpoints.custom);
		assert.equal(config.maxTokens, 4096);
		assert.equal(config.tokenParameter, "max_completion_tokens");
		assert.equal(config.configured, true);
	}
	assert.equal(
		resolveChatConfig({
			CHAT_PROVIDER: "gemini",
			CHAT_BASE_URL: "https://gateway.example/v1",
		}).endpoint,
		endpoints.custom,
	);
});

test("legacy keys keep their endpoint; switching providers never reuses a legacy key", () => {
	const legacy = resolveChatConfig({ BAILIAN_API_KEY: "legacy-key" });
	assert.equal(legacy.provider, "bailian-token-plan");
	assert.equal(legacy.model, "deepseek-v4.1-flash");
	assert.equal(legacy.configured, true);
	const switched = resolveChatConfig({
		CHAT_PROVIDER: "openai",
		CHAT_MODEL: "model",
		BAILIAN_API_KEY: "legacy-key",
	});
	assert.equal(switched.apiKey, "");
	assert.equal(switched.configured, false);
	const modern = resolveChatConfig({
		CHAT_PROVIDER: "deepseek",
		CHAT_API_KEY: "new-key",
		BAILIAN_API_KEY: "old-key",
		BAILIAN_CHAT_BASE_URL: "https://old.example/v1",
		BAILIAN_CHAT_MODEL: "old-model",
	});
	assert.equal(modern.apiKey, "new-key");
	assert.equal(modern.endpoint, endpoints.deepseek);
	assert.equal(modern.model, "deepseek-flash");
});

test("missing or invalid configuration is unconfigured in status and cannot call upstream", async () => {
	const incomplete = [
		{},
		{ CHAT_PROVIDER: "custom", CHAT_API_KEY: "private", CHAT_MODEL: "model" },
		{ CHAT_PROVIDER: "openai", CHAT_API_KEY: "private" },
	];
	const invalid = [
		{ CHAT_PROVIDER: "toString" },
		...[
			"not a url",
			"http://gateway.example/v1",
			"https://user:pass@gateway.example/v1",
			"https://gateway.example/v1?key=secret",
			"https://gateway.example/v1#fragment",
		].map((CHAT_BASE_URL) => ({ CHAT_BASE_URL })),
		{ CHAT_TOKEN_PARAMETER: "invalid" },
		{ CHAT_MAX_TOKENS: "1" },
		{ CHAT_MAX_TOKENS: "999999" },
		{ CHAT_MAX_TOKENS: "NaN" },
		{ CHAT_MAX_TOKENS: "1.5" },
	];
	let calls = 0;
	for (const env of [...incomplete, ...invalid]) {
		const data = await status({
			request: new Request("https://example.com/api/chat/status"),
			env,
		}).json();
		assert.equal(data.configured, false);
		const response = await chat({
			request: new Request("https://example.com/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: "hi" }),
			}),
			env,
			fetchImpl: async () => {
				calls++;
				throw new Error("Should not call");
			},
		});
		assert.equal(response.status, 503);
	}
	assert.equal(calls, 0);
});
