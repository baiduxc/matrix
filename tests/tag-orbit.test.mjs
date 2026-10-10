import { test } from "node:test";
import assert from "node:assert/strict";
import { createTagOrbit } from "../src/matrix/lib/tag-orbit.js";

test("tag drag rotates both axes, suppresses accidental filtering, and preserves normal clicks", () => {
	const orbit = createTagOrbit();
	const start = orbit.tick(0, false);
	orbit.start(1, 100, 100);
	assert.equal(orbit.move(2, 300, 300, 800), false);
	assert.equal(orbit.move(1, 102, 102, 800), false);
	assert.equal(orbit.move(1, 260, 200, 800), true);
	const moved = orbit.tick(16, false);
	assert.ok(moved.yaw > start.yaw);
	assert.ok(moved.pitch > start.pitch);
	assert.equal(moved.dragging, true);
	orbit.end(1);
	assert.equal(orbit.blocksClick(), true);
	const released = orbit.tick(32, true);
	assert.equal(released.dragging, false);
	assert.ok(released.yaw > moved.yaw);
	orbit.start(1, 100, 100);
	orbit.end(1);
	assert.equal(orbit.blocksClick(), false);
});
test("automatic rotation pauses without jumping on resume and cancelled drag releases control", () => {
	const orbit = createTagOrbit();
	orbit.tick(0, true);
	const moving = orbit.tick(32, true);
	assert.ok(moving.yaw > 0);
	assert.equal(orbit.tick(10000, false).yaw, moving.yaw);
	assert.ok(orbit.tick(10032, true).yaw - moving.yaw < 0.02);
	orbit.start(3, 0, 0);
	orbit.move(3, 4000, 4000, 400);
	orbit.end(3, true);
	assert.equal(orbit.tick(10048, false).dragging, false);
	assert.ok(Math.abs(orbit.tick(10064, false).pitch) <= 1.2);
});
