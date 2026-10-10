// One orbit persists across React renders; dragging never triggers a tag filter.
export function createTagOrbit() {
	let yaw = 0,
		pitch = -0.14,
		last = null,
		press = null,
		blocked = false;
	let speedX = 0,
		speedY = 0;
	return {
		start(id, x, y) {
			press = { id, x, y, lastX: x, lastY: y, moved: false };
			blocked = false;
			speedX = speedY = 0;
		},
		move(id, x, y, extent) {
			if (!press || press.id !== id) return false;
			if (Math.hypot(x - press.x, y - press.y) > 6) press.moved = true;
			if (!press.moved) return false;
			const scale = 4 / Math.max(200, extent);
			speedX = (x - press.lastX) * scale;
			speedY = (y - press.lastY) * scale;
			yaw += speedX;
			pitch = Math.max(-1.2, Math.min(1.2, pitch + speedY));
			press.lastX = x;
			press.lastY = y;
			return true;
		},
		end(id, cancelled = false) {
			if (!press || press.id !== id) return;
			blocked = press.moved;
			press = null;
			if (cancelled) speedX = speedY = 0;
		},
		blocksClick() {
			return blocked;
		},
		tick(now, animate) {
			const elapsed = last === null ? 0 : Math.min((now - last) / 1000, 0.04);
			last = now;
			if (!press && animate) {
				yaw += elapsed * 0.34 + speedX * elapsed * 35;
				pitch = Math.max(-1.2, Math.min(1.2, pitch + speedY * elapsed * 35));
				speedX *= Math.exp(-elapsed * 5);
				speedY *= Math.exp(-elapsed * 5);
			}
			return { yaw, pitch, dragging: !!press?.moved };
		},
	};
}
