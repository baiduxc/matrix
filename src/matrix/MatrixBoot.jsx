import { siteMeta } from "./config/site.js";
export function MatrixBoot({ error = false }) {
	return (
		<div
			className="boot-screen matrix-startup"
			role="status"
			aria-live="polite"
		>
			<span>{siteMeta.brand}</span>
			{error ? (
				<>
					<small>文章索引加载失败</small>
					<a href="">重新连接 →</a>
				</>
			) : (
				<small>正在进入矩阵</small>
			)}
		</div>
	);
}
