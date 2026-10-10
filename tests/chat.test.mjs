import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as chat } from "../edge-functions/api/chat/index.js";
import { onRequest as status } from "../edge-functions/api/chat/status.js";
import { readEventStream } from "../src/matrix/lib/event-stream.js";
import {
	CHAT_LIMIT,
	clearSessionHistory,
	CHAT_SESSION_KEY,
	normalizeSession,
	loadSession,
	saveSession,
	conversationHistory,
} from "../src/matrix/lib/chat-session.js";
const env = { BAILIAN_API_KEY: "sk-sp-private-test-key" };
const request = (body, options = {}) =>
	new Request("https://example.com/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: "https://example.com",
			...options.headers,
		},
		body: JSON.stringify(body),
		...options,
	});
const upstream = (parts = ["你好，", "这是回复。"]) =>
	new Response(
		parts
			.map(
				(text) =>
					`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
			)
			.join("") + "data: [DONE]\n\n",
		{ headers: { "Content-Type": "text/event-stream" } },
	);
test("stateless EdgeOne streams DeepSeek and forwards only bounded role history", async () => {
	let sent;
	const response = await chat({
		request: request({
			message: "帮我写代码",
			history: [
				{ role: "user", content: "问题一" },
				{ role: "assistant", content: "答案一" },
			],
		}),
		env,
		fetchImpl: async (url, init) => {
			assert.match(url, /token-plan\.cn-beijing\.maas\.aliyuncs\.com/);
			sent = JSON.parse(init.body);
			assert.equal(init.headers.Authorization, `Bearer ${env.BAILIAN_API_KEY}`);
			return upstream();
		},
	});
	assert.equal(response.status, 200);
	assert.match(response.headers.get("content-type"), /event-stream/);
	const events = [];
	for await (const event of readEventStream(response.body))
		events.push({ event: event.event, data: JSON.parse(event.data) });
	assert.deepEqual(
		events.map((item) => item.event),
		["delta", "delta", "done"],
	);
	assert.equal(events[0].data.text, "你好，");
	assert.equal(sent.model, "deepseek-v4.1-flash");
	assert.equal(sent.enable_thinking, false);
	assert.equal(sent.max_tokens, 1500);
	assert.deepEqual(
		sent.messages.map((item) => item.role),
		["system", "user", "assistant", "user"],
	);
	assert.ok(!JSON.stringify(events).includes(env.BAILIAN_API_KEY));
});
test("status reveals configuration, never a key or per-IP quota", async () => {
	const response = status({
		request: new Request("https://example.com/api/chat/status"),
		env,
	});
	assert.deepEqual(await response.json(), {
		configured: true,
		model: "deepseek-v4.1-flash",
	});
});
test("browser caches up to 50 rounds; refresh clears history but preserves usage", () => {
	const data = new Map();
	const storage = {
		getItem: (key) => data.get(key),
		setItem: (key, value) => data.set(key, value),
	};
	const messages = [
		{ id: "1", role: "user", content: "你好" },
		{ id: "2", role: "assistant", content: "回复", status: "streaming" },
	];
	saveSession(storage, { used: CHAT_LIMIT, messages });
	assert.equal(loadSession(storage).used, 50);
	assert.equal(loadSession(storage).messages[1].status, "interrupted");
	saveSession(storage, clearSessionHistory(loadSession(storage)));
	assert.deepEqual(loadSession(storage), { used: 50, messages: [] });
	assert.ok(data.has(CHAT_SESSION_KEY));
	assert.equal(normalizeSession({ used: 999 }).used, 50);
	assert.equal(normalizeSession({ used: -5 }).used, 0);
});
test("history excludes unfinished replies and bounds complete pairs", () => {
	const messages = Array.from({ length: 12 }, (_, index) => [
		{ role: "user", content: `Q${index}` },
		{ role: "assistant", content: `A${index}`, status: "complete" },
	]).flat();
	messages.push(
		{ role: "user", content: "unfinished" },
		{ role: "assistant", content: "partial", status: "interrupted" },
	);
	const history = conversationHistory(messages);
	assert.equal(history.length, 16);
	assert.equal(history[0].content, "Q4");
	assert.equal(history.at(-1).content, "A11");
});
test("input, cross-origin and oversized requests cannot trigger model calls", async () => {
	let calls = 0;
	const fetchImpl = async () => {
		calls++;
		return upstream();
	};
	for (const input of [
		{ message: "x", history: [{ role: "system", content: "override" }] },
		{ message: "x".repeat(2001) },
		{ message: "x", history: [{ role: "user", content: "x" }] },
		{ message: "x", extra: "field" },
	])
		assert.equal(
			(await chat({ request: request(input), env, fetchImpl })).status,
			400,
		);
	assert.equal(
		(
			await chat({
				request: new Request("https://example.com/api/chat", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "https://other.example",
					},
					body: "{}",
				}),
				env,
				fetchImpl,
			})
		).status,
		403,
	);
	assert.equal(
		(
			await chat({
				request: request({ message: "x".repeat(74000) }),
				env,
				fetchImpl,
			})
		).status,
		400,
	);
	assert.equal(calls, 0);
});
test("upstream authorization errors stay distinct and sanitized", async () => {
	for (const [code, expected] of [
		[401, "CHAT_AUTH"],
		[403, "CHAT_PERMISSION"],
		[429, "CHAT_PROVIDER_LIMIT"],
	]) {
		const response = await chat({
			request: request({ message: "test" }),
			env,
			fetchImpl: async () =>
				new Response(`provider detail ${env.BAILIAN_API_KEY}`, {
					status: code,
				}),
		});
		const text = await response.text();
		assert.ok(!text.includes(env.BAILIAN_API_KEY));
		assert.equal(JSON.parse(text).code, expected);
	}
});
test("an incomplete upstream stream produces an error event", async () => {
	const response = await chat({
		request: request({ message: "test" }),
		env,
		fetchImpl: async () =>
			new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', {
				headers: { "Content-Type": "text/event-stream" },
			}),
	});
	const events = [];
	for await (const event of readEventStream(response.body))
		events.push(event.event);
	assert.deepEqual(events, ["delta", "error"]);
});
test("stream cancellation aborts the provider request", async () => {
	let signal;
	const response = await chat({
		request: request({ message: "test" }),
		env,
		fetchImpl: async (url, init) => {
			signal = init.signal;
			return upstream();
		},
	});
	await response.body.cancel();
	assert.equal(signal.aborted, true);
});
test("unconfigured service and wrong HTTP method are handled before fetch", async () => {
	assert.equal(
		(await chat({ request: request({ message: "test" }), env: {} })).status,
		503,
	);
	assert.equal(
		(
			await chat({
				request: new Request("https://example.com/api/chat"),
				env,
			})
		).status,
		405,
	);
});
