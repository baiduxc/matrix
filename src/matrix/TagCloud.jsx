import { useEffect, useMemo, useRef } from "react";
import { createFrameLoop } from "./lib/frame-loop.js";
import { createTagOrbit } from "./lib/tag-orbit.js";
import { countTags } from "./lib/article-browser.js";

export function TagCloud({ posts, selected, onSelect, paused }) {
	const allTags = useMemo(() => countTags(posts), [posts]);
	const tags = useMemo(() => {
		const visible = allTags.slice(0, 160);
		const chosen = allTags.find(({ name }) => name === selected);
		if (chosen && !visible.includes(chosen))
			visible[visible.length - 1] = chosen;
		return visible;
	}, [allTags, selected]);
	const cloud = useRef(null),
		loopRef = useRef(null);
	const orbit = useRef(null),
		hovering = useRef(false);
	if (!orbit.current) orbit.current = createTagOrbit();
	useEffect(() => {
		const root = cloud.current;
		if (!root) return;
		const nodes = [...root.querySelectorAll("[data-cloud-tag]")];
		const desktop = matchMedia("(min-width: 701px)");
		let sizes = [];
		const points = tags.map((_, index) => {
			const y = 1 - (2 * (index + 0.5)) / tags.length;
			const r = Math.sqrt(1 - y * y),
				angle = index * Math.PI * (3 - Math.sqrt(5));
			return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r };
		});
		const draw = (now) => {
			if (!desktop.matches || document.hidden || !sizes.length) return;
			const { yaw, pitch } = orbit.current.tick(
				now,
				!paused && !hovering.current,
			);
			const radius = Math.min(root.clientWidth, root.clientHeight) * 0.43;
			const positions = nodes
				.map((node, index) => {
					const p = points[index],
						x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
					const z = p.z * Math.cos(yaw) - p.x * Math.sin(yaw);
					const y = p.y * Math.cos(pitch) - z * Math.sin(pitch),
						depth = z * Math.cos(pitch) + p.y * Math.sin(pitch);
					return {
						node,
						index,
						x: x * radius,
						y: y * radius,
						depth,
						scale: 0.65 + (depth + 1) * 0.24,
					};
				})
				.sort(
					(a, b) =>
						Number(b.node === document.activeElement) -
							Number(a.node === document.activeElement) || b.depth - a.depth,
				);
			const occupied = [];
			for (const { node, index, x, y, depth, scale } of positions) {
				const halfWidth = (sizes[index].width * scale) / 2 + 1,
					halfHeight = (sizes[index].height * scale) / 2 + 1;
				const bounds = {
					left: x - halfWidth,
					right: x + halfWidth,
					top: y - halfHeight,
					bottom: y + halfHeight,
				};
				const overlaps = occupied.some(
					(rect) =>
						bounds.left < rect.right &&
						bounds.right > rect.left &&
						bounds.top < rect.bottom &&
						bounds.bottom > rect.top,
				);
				const visible = !overlaps || node === document.activeElement;
				node.style.visibility = visible ? "visible" : "hidden";
				if (!visible) continue;
				occupied.push(bounds);
				node.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale})`;
				node.style.opacity = String(0.3 + 0.7 * ((depth + 1) / 2) ** 1.3);
				node.style.zIndex = String(Math.round((depth + 1) * 100));
			}
		};
		const loop = createFrameLoop(draw);
		loopRef.current = loop;
		const sync = () => {
			loop.setActive(
				tags.length > 0 && desktop.matches && !paused && !document.hidden,
			);
			if (desktop.matches && !document.hidden) loop.invalidate();
		};
		const measure = () => {
			sizes = nodes.map((node) => ({
				width: node.offsetWidth,
				height: node.offsetHeight,
			}));
			sync();
		};
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		measure();
		desktop.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			loop.dispose();
			loopRef.current = null;
			observer.disconnect();
			desktop.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
		};
	}, [tags, paused]);
	const finish = (event, cancelled = false) => {
		orbit.current.end(event.pointerId, cancelled);
		event.currentTarget.classList.remove("is-dragging");
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
		loopRef.current?.invalidate();
	};
	return (
		<aside className="tag-observatory" aria-label="动态文章标签云">
			<div className="tag-cloud-heading">
				<span>探索标签</span>
				<small>{allTags.length} 个主题</small>
			</div>
			<div
				className="tag-sphere"
				ref={cloud}
				onPointerDown={(event) => {
					if (event.button !== 0 || !event.isPrimary) return;
					orbit.current.start(event.pointerId, event.clientX, event.clientY);
					// Capture on the original button first so a simple click keeps its target.
					(
						event.target.closest("button") || event.currentTarget
					).setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					if (
						orbit.current.move(
							event.pointerId,
							event.clientX,
							event.clientY,
							Math.min(
								event.currentTarget.clientWidth,
								event.currentTarget.clientHeight,
							),
						)
					) {
						event.currentTarget.setPointerCapture(event.pointerId);
						event.currentTarget.classList.add("is-dragging");
						hovering.current = false;
						loopRef.current?.invalidate();
					}
				}}
				onPointerUp={(event) => finish(event)}
				onPointerCancel={(event) => finish(event, true)}
				onLostPointerCapture={(event) => {
					if (event.target === event.currentTarget) finish(event, true);
				}}
				onClickCapture={(event) => {
					if (event.detail > 0 && orbit.current.blocksClick()) {
						event.preventDefault();
						event.stopPropagation();
					}
				}}
				onPointerLeave={() => {
					hovering.current = false;
				}}
				onFocusCapture={(event) => {
					hovering.current = event.target.matches(":focus-visible");
				}}
				onBlurCapture={() => {
					hovering.current = false;
				}}
			>
				<div className="tag-orbit tag-orbit-one" aria-hidden="true" />
				<div className="tag-orbit tag-orbit-two" aria-hidden="true" />
				<div className="tag-orbit tag-orbit-three" aria-hidden="true" />
				<div className="tag-core" aria-hidden="true">
					<i />
					<span>
						IDEAS
						<br />
						CONNECTED
					</span>
				</div>
				{tags.map(({ name, count }) => (
					<button
						type="button"
						key={name}
						data-cloud-tag
						className={selected === name ? "selected" : ""}
						style={{
							fontSize: `${Math.min(24, 12 + Math.log2(count + 1) * 1.6)}px`,
						}}
						aria-pressed={selected === name}
						aria-label={`${name}，${count} 篇文章`}
						onPointerEnter={() => {
							hovering.current = true;
						}}
						onPointerLeave={() => {
							hovering.current = false;
						}}
						onClick={() => onSelect(selected === name ? "" : name)}
					>
						{name}
					</button>
				))}
			</div>
			<p className="tag-cloud-hint">按住拖动旋转 · 点击标签探索文章</p>
		</aside>
	);
}
