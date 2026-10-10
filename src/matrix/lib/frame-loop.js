// One scheduled frame at a time; inactive pages have no recurring callback.
export function createFrameLoop(
	render,
	{
		request = (callback) => requestAnimationFrame(callback),
		cancel = (id) => cancelAnimationFrame(id),
	} = {},
) {
	let handle = null,
		active = false,
		disposed = false,
		frames = 0;
	const invalidate = () => {
		if (!disposed && handle === null) handle = request(tick);
	};
	const tick = (time) => {
		handle = null;
		if (disposed) return;
		frames++;
		render(time);
		if (active) invalidate();
	};
	return {
		invalidate,
		setActive(value) {
			if (disposed) return;
			active = !!value;
			if (active) invalidate();
			else if (handle !== null) {
				cancel(handle);
				handle = null;
			}
		},
		getDiagnostics() {
			return { active, scheduled: handle !== null, frames };
		},
		dispose() {
			disposed = true;
			active = false;
			if (handle !== null) cancel(handle);
			handle = null;
		},
	};
}
