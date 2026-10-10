import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrameLoop } from "../src/matrix/lib/frame-loop.js";
import {
	ARTICLE_CACHE_LIMIT,
	rememberArticle,
	recallArticle,
} from "../src/matrix/lib/article-cache.js";
import { createSoundEngine } from "../src/matrix/sound-engine.js";

test("frame loop has at most one callback and releases it when inactive or disposed", () => {
	const queue = new Map();
	let id = 0,
		renders = 0;
	const loop = createFrameLoop(() => renders++, {
		request: (callback) => {
			queue.set(++id, callback);
			return id;
		},
		cancel: (handle) => queue.delete(handle),
	});
	loop.setActive(true);
	loop.setActive(true);
	loop.invalidate();
	assert.equal(queue.size, 1);
	const [handle, callback] = queue.entries().next().value;
	queue.delete(handle);
	callback(100);
	assert.equal(renders, 1);
	assert.equal(queue.size, 1);
	loop.setActive(false);
	assert.equal(queue.size, 0);
	loop.invalidate();
	const [once, draw] = queue.entries().next().value;
	queue.delete(once);
	draw(200);
	assert.equal(renders, 2);
	assert.equal(queue.size, 0);
	loop.setActive(true);
	loop.dispose();
	loop.invalidate();
	loop.setActive(true);
	assert.equal(queue.size, 0);
});
test("article LRU evicts old HTML and stays bounded during long reading sessions", () => {
	const cache = new Map();
	for (let i = 0; i < 1000; i++) rememberArticle(cache, String(i), `body-${i}`);
	assert.equal(cache.size, ARTICLE_CACHE_LIMIT);
	assert.equal(recallArticle(cache, "0"), undefined);
	assert.equal(recallArticle(cache, "992"), "body-992");
	rememberArticle(cache, "1000", "body-1000");
	assert.equal(cache.has("992"), true);
	assert.equal(cache.has("993"), false);
});
test("sound unlocks, produces non-silent bell/type/beam buffers, and releases sources", async () => {
	const instances = [];
	class Context {
		state = "suspended";
		currentTime = 0;
		sampleRate = 48000;
		destination = {};
		buffers = [];
		sources = [];
		constructor() {
			instances.push(this);
		}
		createBuffer(channels, length) {
			const data = new Float32Array(length);
			this.buffers.push(data);
			return { getChannelData: () => data };
		}
		createGain() {
			return { gain: { value: 0 }, connect() {}, disconnect() {} };
		}
		createBufferSource() {
			const source = {
				connect() {},
				disconnect() {
					this.disconnected = true;
				},
				start() {
					this.started = true;
				},
				stop() {
					this.stopped = true;
				},
			};
			this.sources.push(source);
			return source;
		}
		async resume() {
			this.state = "running";
		}
		async close() {
			this.state = "closed";
		}
	}
	const oldWindow = globalThis.window,
		oldDocument = globalThis.document;
	globalThis.window = { AudioContext: Context };
	globalThis.document = { hidden: false };
	try {
		const engine = createSoundEngine();
		for (const kind of ["click", "type", "beam"]) {
			await engine.play(kind);
			instances[0].currentTime += 1;
		}
		assert.equal(instances[0].state, "running");
		assert.equal(
			instances[0].sources.filter((source) => source.started).length,
			3,
		);
		for (const samples of instances[0].buffers)
			assert.ok(samples.some((value) => Math.abs(value) > 0.05));
		assert.equal(engine.getDiagnostics().sources, 3);
		engine.setVisible(false);
		assert.equal(engine.getDiagnostics().sources, 0);
		assert.ok(
			instances[0].sources.every(
				(source) => source.stopped && source.disconnected,
			),
		);
		engine.dispose();
		engine.dispose();
		assert.equal(engine.isDisposed(), true);
		await engine.play("click");
		assert.equal(instances[0].sources.length, 3);
		const replacement = createSoundEngine();
		await replacement.play("click");
		assert.equal(instances[1].sources.length, 1);
		replacement.dispose();
	} finally {
		globalThis.window = oldWindow;
		globalThis.document = oldDocument;
	}
});

test("disabled sound creates no AudioContext and stays silent for every effect", async () => {
	const { siteMeta } = await import("../src/matrix/config/site.js");
	const previous = siteMeta.soundEnabled;
	const oldWindow = globalThis.window;
	let contexts = 0;
	globalThis.window = {
		AudioContext: class {
			constructor() {
				contexts++;
				throw new Error("Must not create audio resources");
			}
		},
	};
	siteMeta.soundEnabled = false;
	try {
		const engine = createSoundEngine();
		for (const kind of ["click", "type", "beam"]) await engine.play(kind);
		engine.setVisible(true);
		assert.equal(contexts, 0);
		assert.deepEqual(engine.getDiagnostics(), {
			state: "disabled",
			sources: 0,
		});
		engine.dispose();
		assert.equal(engine.isDisposed(), true);
	} finally {
		siteMeta.soundEnabled = previous;
		globalThis.window = oldWindow;
	}
});
