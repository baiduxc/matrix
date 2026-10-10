// Local opt-in instrumentation. Vite removes this module from production builds.
import { useEffect, useState } from "react";
export default function RuntimeDiagnostics({ read }) {
	const [metrics, setMetrics] = useState({});
	useEffect(() => {
		const sample = () =>
			setMetrics({
				...read(),
				heapMiB: performance.memory
					? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2)
					: null,
				domNodes: document.querySelectorAll("*").length,
			});
		sample();
		const interval = setInterval(sample, 1000);
		return () => clearInterval(interval);
	}, [read]);
	return (
		<output
			data-matrix-diagnostics
			style={{
				position: "fixed",
				left: 12,
				bottom: 48,
				zIndex: 100,
				pointerEvents: "none",
				font: "11px/1.5 monospace",
				whiteSpace: "pre-wrap",
				maxWidth: 360,
				padding: 10,
				background: "#fffE",
				color: "#153c25",
				border: "1px solid #69b989",
			}}
		>
			{JSON.stringify(metrics, null, 2)}
		</output>
	);
}
