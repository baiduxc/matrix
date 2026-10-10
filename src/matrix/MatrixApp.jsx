import { useEffect, useState } from "react";
import App from "./App.jsx";
import { MatrixBoot } from "./MatrixBoot.jsx";
export default function MatrixApp({ initialArticle }) {
	const [posts, setPosts] = useState(null),
		[error, setError] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		fetch("/content/articles.json", { signal: controller.signal })
			.then((response) => {
				if (!response.ok) throw new Error("Catalog unavailable");
				return response.json();
			})
			.then((data) => {
				if (!Array.isArray(data)) throw new Error("Invalid catalog");
				setPosts(data);
			})
			.catch(() => {
				if (!controller.signal.aborted) setError(true);
			});
		return () => controller.abort();
	}, []);
	if (posts) return <App posts={posts} initialArticle={initialArticle} />;
	return <MatrixBoot error={error} />;
}
