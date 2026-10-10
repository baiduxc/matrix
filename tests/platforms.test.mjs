import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as cloudflareChat } from "../functions/api/chat/index.js";
import { onRequest as edgeChat } from "../edge-functions/api/chat/index.js";
import { onRequest as cloudflareStatus } from "../functions/api/chat/status.js";
import vercelChat from "../api/chat.js";
import vercelStatus from "../api/chat/status.js";

test("Cloudflare and EdgeOne share validation and streaming handlers", async () => {
	assert.equal(cloudflareChat, edgeChat);
	const response = await cloudflareStatus({
		request: new Request("https://example.com/api/chat/status"),
		env: { BAILIAN_API_KEY: "private-test-key" },
	});
	assert.equal((await response.json()).configured, true);
});

test("Vercel adapters use server environment without exposing secrets", async () => {
	const previous = process.env.BAILIAN_API_KEY;
	process.env.BAILIAN_API_KEY = "private-test-key";
	try {
		const status = await vercelStatus.fetch(
			new Request("https://example.com/api/chat/status"),
		);
		const text = await status.text();
		assert.equal(JSON.parse(text).configured, true);
		assert.ok(!text.includes("private-test-key"));
		const rejected = await vercelChat.fetch(
			new Request("https://example.com/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "https://other.example",
				},
				body: JSON.stringify({ message: "hello" }),
			}),
		);
		assert.equal(rejected.status, 403);
	} finally {
		if (previous === undefined) delete process.env.BAILIAN_API_KEY;
		else process.env.BAILIAN_API_KEY = previous;
	}
});
