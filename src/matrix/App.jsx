import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUpRight,
	GithubLogo,
	List,
	MagnifyingGlass,
	X,
	Code,
	Check,
	Link,
	Fingerprint,
	CaretRight,
} from "@phosphor-icons/react";
import DOMPurify from "dompurify";
import { createMatrixScene } from "./matrix-scene.js";
import { syntaxTheme } from "./config/syntax-highlighting.js";
import {
	hackerFrames,
	operatorFrames,
	characterConfig,
} from "./config/characters.js";
import { createSoundEngine } from "./sound-engine.js";
import { ArticleCredit } from "./ArticleCredit.jsx";
import { rememberArticle, recallArticle } from "./lib/article-cache.js";
import { TagCloud } from "./TagCloud.jsx";
import {
	ARCHIVE_PAGE_SIZE,
	HOME_PAGE_COUNT,
	archiveLocation,
	archivePath,
	searchArticles,
} from "./lib/article-browser.js";
import { ChatDialog } from "./ChatDialog.jsx";
import { siteMeta } from "./config/site.js";
import { getArticleColumns } from "./config/layout.js";
const Diagnostics = import.meta.env.DEV
	? lazy(() => import("./RuntimeDiagnostics.jsx"))
	: null;
const art = {
	world: "/assets/matrix/world.webp",
	city: "/assets/matrix/city.webp",
};

const pad = (n) => String(n).padStart(2, "0");
const date = (v) => v.replaceAll("-", ".");
const projects = siteMeta.projects;
function routePath(mode, index, posts, page = 1, tag = "") {
	return mode === "reader"
		? posts[index]?.url || "/"
		: {
				matrix: "/",
				list: archivePath(page, tag),
				projects: "/projects/",
				about: "/about/",
			}[mode] || "/";
}
function readLocation(posts) {
	const path = decodeURI(location.pathname).replace(/\/+$/, "") || "/";
	const legacy = location.hash.slice(1).split("/");
	const slug = path.startsWith("/posts/")
		? path.slice(7)
		: legacy[0] === "article"
			? legacy.slice(1).join("/")
			: "";
	if (slug) {
		const active = posts.findIndex((post) => post.id === slug);
		if (active >= 0) return { mode: "reader", active };
	}
	return {
		mode:
			{
				"/archive": "list",
				"/articles": "list",
				"/projects": "projects",
				"/about": "about",
			}[path] ||
			(["matrix", "list", "projects", "about"].includes(legacy[0])
				? legacy[0]
				: "matrix"),
		active: 0,
	};
}
function useDialogFocus(open, ref, onClose, fallback) {
	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement;
		const items = () => [
			...(ref.current?.querySelectorAll(
				"button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
			) || []),
		];
		items()[0]?.focus();
		const trap = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key !== "Tab") return;
			const nodes = items();
			if (!nodes.length) return;
			if (e.shiftKey && document.activeElement === nodes[0]) {
				e.preventDefault();
				nodes.at(-1)?.focus();
			} else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
				e.preventDefault();
				nodes[0]?.focus();
			}
		};
		document.addEventListener("keydown", trap);
		return () => {
			document.removeEventListener("keydown", trap);
			(previous?.isConnected ? previous : fallback.current)?.focus?.({
				preventScroll: true,
			});
		};
	}, [open, ref, onClose, fallback]);
}
export default function App({ posts, initialArticle = null }) {
	const initial = useRef(readLocation(posts)).current;
	const diagnostics = useRef(
		import.meta.env.DEV &&
			new URLSearchParams(location.search).has("diagnostics"),
	).current;
	const [mode, setMode] = useState(initial.mode),
		[active, setActive] = useState(initial.active);
	const initialArchive = useRef(
		archiveLocation(location.search, posts.length),
	).current;
	const [archivePage, setArchivePage] = useState(initialArchive.page),
		[archiveTag, setArchiveTag] = useState(initialArchive.tag);
	const [paused, setPaused] = useState(
		() => matchMedia("(prefers-reduced-motion: reduce)").matches,
	);
	const [ready, setReady] = useState(false),
		[failed, setFailed] = useState(false);
	const [transition, setTransition] = useState(""),
		[beam, setBeam] = useState(null),
		[burst, setBurst] = useState([]);
	const [chat, setChat] = useState(false),
		[search, setSearch] = useState(false),
		[query, setQuery] = useState("");
	const [copied, setCopied] = useState(false);
	const [characterAction, setCharacterAction] = useState("idle"),
		[hoveredCover, setHoveredCover] = useState(null),
		[agentHovered, setAgentHovered] = useState(false);
	const [railPage, setRailPage] = useState(0),
		[railSize, setRailSize] = useState(() => getArticleColumns(innerWidth)),
		[railShift, setRailShift] = useState(0);
	const canvasRef = useRef(null),
		sceneRef = useRef(null),
		scrollRef = useRef(null),
		mainRef = useRef(null),
		neoRef = useRef(null),
		appRef = useRef(null);
	const chatRef = useRef(null),
		searchRef = useRef(null),
		agentButtonRef = useRef(null),
		markdownRef = useRef(null);
	const stateRef = useRef({ mode, active, paused }),
		lock = useRef(false),
		timers = useRef(new Set()),
		audioRef = useRef(null),
		wheelMotion = useRef({ total: 0, last: 0 });
	const railStart = railPage * railSize;
	const current = posts[active] || { id: null, title: "", short: "", tags: [] },
		modal = chat || search;
	const articles = useRef(
		new Map(initialArticle ? [[initialArticle.id, initialArticle.html]] : []),
	);
	const readDiagnostics = useCallback(
		() => ({
			mode: stateRef.current.mode,
			cachedArticles: articles.current.size,
			pendingTimers: timers.current.size,
			scene: sceneRef.current?.getDiagnostics?.() || null,
			audio: audioRef.current?.getDiagnostics() || null,
		}),
		[],
	);
	const [article, setArticle] = useState(initialArticle),
		[articleError, setArticleError] = useState("");
	const [articleLoading, setArticleLoading] = useState(false);
	const content = useMemo(
		() => (article?.id === current.id ? DOMPurify.sanitize(article.html) : ""),
		[article, current.id],
	);
	useEffect(() => {
		if (mode !== "reader") return;
		const cached = recallArticle(articles.current, current.id);
		if (cached !== undefined) {
			setArticle({ id: current.id, html: cached });
			setArticleLoading(false);
			setArticleError("");
			return;
		}
		const controller = new AbortController();
		setArticleLoading(true);
		setArticleError("");
		fetch(current.contentUrl, { signal: controller.signal })
			.then((response) => {
				if (!response.ok) throw new Error("文章加载失败");
				return response.json();
			})
			.then((data) => {
				if (data.id !== current.id || typeof data.html !== "string")
					throw new Error("文章数据异常");
				rememberArticle(articles.current, data.id, data.html);
				setArticle(data);
			})
			.catch((error) => {
				if (!controller.signal.aborted) setArticleError(error.message);
			})
			.finally(() => {
				if (!controller.signal.aborted) setArticleLoading(false);
			});
		return () => controller.abort();
	}, [mode, current.id, current.contentUrl]);
	useEffect(() => {
		if (mode !== "reader" || !content) return;
		const nodes = [
			...(markdownRef.current?.querySelectorAll(".mermaid") || []),
		];
		if (!nodes.length) return;
		let cancelled = false;
		import("mermaid")
			.then(async ({ default: mermaid }) => {
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: "strict",
					theme: "default",
					flowchart: { htmlLabels: false },
					maxTextSize: 50000,
				});
				for (const node of nodes) {
					if (cancelled) return;
					const source = node.dataset.mermaidCode || node.textContent;
					try {
						const { svg } = await mermaid.render(
							`matrix-diagram-${crypto.randomUUID()}`,
							source,
						);
						if (!cancelled && node.isConnected)
							node.innerHTML = DOMPurify.sanitize(svg, {
								USE_PROFILES: { svg: true, svgFilters: true },
							});
					} catch {
						/* Preserve readable source when an older diagram cannot render. */
					}
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [mode, content]);
	const closeChat = useCallback(() => setChat(false), []),
		closeSearch = useCallback(() => setSearch(false), []);
	useEffect(() => {
		window.scrollTo({ top: 0, behavior: "instant" });
	}, [mode, active, archivePage, archiveTag]);
	useEffect(() => {
		if (!modal) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [modal]);
	useDialogFocus(chat, chatRef, closeChat, agentButtonRef);
	useDialogFocus(search, searchRef, closeSearch, agentButtonRef);
	const later = useCallback((fn, delay) => {
		const id = setTimeout(() => {
			timers.current.delete(id);
			fn();
		}, delay);
		timers.current.add(id);
		return id;
	}, []);
	const clearTransition = useCallback(() => {
		timers.current.forEach(clearTimeout);
		timers.current.clear();
		lock.current = false;
		setTransition("");
		setBeam(null);
		setBurst([]);
		sceneRef.current?.setState({ warp: 0 });
	}, []);
	useEffect(() => {
		const scene = createMatrixScene(
			canvasRef.current,
			() => setReady(true),
			() => {
				setFailed(true);
				setReady(true);
			},
		);
		sceneRef.current = scene;
		scene.setState({
			...stateRef.current,
			reading: stateRef.current.mode !== "matrix",
		});
		return () => {
			scene.dispose();
			sceneRef.current = null;
		};
	}, []);
	useEffect(() => {
		stateRef.current = { mode, active, paused };
		sceneRef.current?.setState({
			mode,
			active,
			paused,
			reading: mode !== "matrix" || modal,
		});
		document.title =
			mode === "reader"
				? `${current.title} · ${siteMeta.title}`
				: `${siteMeta.title} · ${mode === "projects" ? "自研项目" : mode === "about" ? "关于我" : mode === "list" ? "文章列表" : "我的数字世界"}`;
		const canonical = document.querySelector('link[rel="canonical"]');
		if (canonical)
			canonical.href = new URL(
				routePath(mode, active, posts, archivePage, archiveTag),
				siteMeta.url,
			).href;
		const description = document.querySelector('meta[name="description"]');
		if (description)
			description.content =
				mode === "reader" ? current.description : siteMeta.description;
		let jsonLd = document.querySelector("[data-matrix-article-schema]");
		if (mode !== "reader") jsonLd?.remove();
		else {
			if (!jsonLd) {
				jsonLd = document.createElement("script");
				jsonLd.type = "application/ld+json";
				jsonLd.dataset.matrixArticleSchema = "";
				document.head.append(jsonLd);
			}
			jsonLd.textContent = JSON.stringify({
				"@context": "https://schema.org",
				"@type": "BlogPosting",
				headline: current.title,
				description: current.description,
				datePublished: current.date,
				dateModified: current.updated,
				author: { "@type": "Person", name: current.author || siteMeta.owner },
				...(current.image
					? { image: new URL(current.image, siteMeta.url).href }
					: {}),
				mainEntityOfPage: new URL(current.url, siteMeta.url).href,
			});
		}
		for (const [property, value] of Object.entries({
			"og:type": mode === "reader" ? "article" : "website",
			"og:title": document.title,
			"og:description":
				mode === "reader" ? current.description : siteMeta.description,
			"og:url": canonical?.href,
			"og:image": new URL(
				mode === "reader" && current.image
					? current.image
					: "/assets/matrix/default-cover.svg",
				siteMeta.url,
			).href,
		})) {
			const node = document.querySelector(`meta[property="${property}"]`);
			if (node) node.content = value;
		}
	}, [
		mode,
		active,
		paused,
		modal,
		chat,
		current.short,
		archivePage,
		archiveTag,
	]);
	useEffect(
		() => () => {
			timers.current.forEach(clearTimeout);
			timers.current.clear();
			audioRef.current?.dispose();
			audioRef.current = null;
		},
		[],
	);
	useEffect(() => {
		// Follow the system setting without exposing a playback/pause control.
		const preference = matchMedia("(prefers-reduced-motion: reduce)");
		const change = (event) => setPaused(event.matches);
		preference.addEventListener("change", change);
		return () => preference.removeEventListener("change", change);
	}, []);
	useEffect(() => {
		const resize = () => {
			const size = getArticleColumns(innerWidth);
			setRailSize(size);
		};
		resize();
		addEventListener("resize", resize);
		return () => removeEventListener("resize", resize);
	}, []);
	useEffect(() => {
		let frame;
		const move = (e) => {
			if (
				paused ||
				modal ||
				!["matrix", "about", "projects"].includes(mode) ||
				e.pointerType === "touch"
			)
				return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				appRef.current?.style.setProperty(
					"--pointer-x",
					(e.clientX / innerWidth - 0.5).toFixed(3),
				);
				appRef.current?.style.setProperty(
					"--pointer-y",
					(e.clientY / innerHeight - 0.5).toFixed(3),
				);
			});
		};
		if (paused) {
			appRef.current?.style.setProperty("--pointer-x", 0);
			appRef.current?.style.setProperty("--pointer-y", 0);
		}
		addEventListener("pointermove", move, { passive: true });
		return () => {
			removeEventListener("pointermove", move);
			cancelAnimationFrame(frame);
		};
	}, [paused, mode, modal]);
	const clearHover = useCallback(() => setHoveredCover(null), []);
	const hoverCover = (index, event) => {
		if (event.pointerType === "touch" || lock.current || modal) return;
		clearHover();
		setHoveredCover(index);
	};
	useEffect(() => {
		if (
			mode !== "matrix" ||
			paused ||
			modal ||
			transition ||
			hoveredCover !== null
		)
			return;
		setCharacterAction("idle");
		const pending = new Set();
		const queue = (fn, delay) => {
			const id = setTimeout(() => {
				pending.delete(id);
				fn();
			}, delay);
			pending.add(id);
		};
		const cycle = () => {
			setCharacterAction("scan");
			queue(() => setCharacterAction("decode"), characterConfig.scanDuration);
			queue(
				() => setCharacterAction("idle"),
				characterConfig.scanDuration + characterConfig.decodeDuration,
			);
		};
		const interval = setInterval(cycle, characterConfig.idleCycle);
		return () => {
			clearInterval(interval);
			pending.forEach(clearTimeout);
		};
	}, [mode, paused, modal, transition, hoveredCover]);
	useEffect(() => {
		if (modal || mode !== "matrix") clearHover();
	}, [modal, mode, clearHover]);
	useEffect(() => {
		const visibility = () => {
			audioRef.current?.setVisible(!document.hidden);
			if (document.hidden) clearHover();
		};
		document.addEventListener("visibilitychange", visibility);
		return () => document.removeEventListener("visibilitychange", visibility);
	}, [clearHover]);
	const navigate = useCallback(
		(
			nextMode,
			index = stateRef.current.active,
			origin,
			listPage = 1,
			listTag = "",
		) => {
			if (lock.current || (nextMode === "reader" && !posts[index])) return;
			setChat(false);
			setSearch(false);
			setQuery("");
			clearHover();
			const fromHome = stateRef.current.mode === "matrix";
			const apply = () => {
				setMode(nextMode);
				setActive(index);
				if (nextMode === "list") {
					setArchivePage(listPage);
					setArchiveTag(listTag);
				}
				history.pushState(
					{},
					"",
					routePath(nextMode, index, posts, listPage, listTag),
				);
				if (scrollRef.current) scrollRef.current.scrollTop = 0;
				later(
					() =>
						document
							.querySelector(
								nextMode === "matrix" ? ".cover-card" : ".panel-heading",
							)
							?.focus({ preventScroll: true }),
					100,
				);
			};
			if (nextMode === stateRef.current.mode && nextMode !== "reader") return;
			if (paused) {
				clearTransition();
				apply();
				return;
			}
			lock.current = true;
			if (nextMode === "reader" && fromHome) {
				setActive(index);
				setTransition("targeting");
				const target = origin || { x: innerWidth / 2, y: innerHeight * 0.78 };
				const portrait = neoRef.current?.getBoundingClientRect();
				const eye = portrait
					? {
							x: portrait.x + portrait.width * characterConfig.eyeAnchor.x,
							y: portrait.y + portrait.height * characterConfig.eyeAnchor.y,
						}
					: { x: innerWidth / 2, y: innerHeight * 0.3 };
				const dx = target.x - eye.x,
					dy = target.y - eye.y;
				setBeam({
					x: eye.x,
					y: eye.y,
					length: Math.hypot(dx, dy),
					angle: (Math.atan2(dy, dx) * 180) / Math.PI,
					tx: target.x,
					ty: target.y,
				});
				const sourceWords =
					`${posts[index].short} ${posts[index].description} ${posts[index].topic} ${posts[index].tags.join(" ")} 代码 原理 系统 AI`.match(
						/[A-Za-z0-9_.:/-]+|[\u3400-\u9fff]{1,4}/g,
					) || [];
				setBurst(
					Array.from(
						{ length: 70 },
						(_, i) => sourceWords[i % sourceWords.length],
					),
				);
				later(() => {
					setTransition("deconstructing");
					sceneRef.current?.setState({ warp: 1 });
				}, 480);
				later(() => {
					apply();
					setBeam(null);
					setTransition("assembling");
					sceneRef.current?.setState({ warp: 0 });
				}, 1280);
				later(() => {
					setTransition("");
					setBurst([]);
					lock.current = false;
				}, 2450);
			} else {
				setTransition("deconstructing");
				sceneRef.current?.setState({ warp: 0.9 });
				later(() => {
					apply();
					setTransition("assembling");
					sceneRef.current?.setState({ warp: 0 });
				}, 650);
				later(() => {
					setTransition("");
					lock.current = false;
				}, 1500);
			}
		},
		[paused, later, clearTransition, clearHover],
	);
	const pageRail = useCallback(
		(direction) => {
			if (lock.current || stateRef.current.mode !== "matrix" || modal) return;
			if (
				direction > 0 &&
				railPage >=
					Math.min(HOME_PAGE_COUNT, Math.ceil(posts.length / railSize)) - 1
			) {
				navigate("list", stateRef.current.active, undefined, 3);
				return;
			}
			const next = Math.max(0, railPage + direction);
			clearHover();
			setRailPage(next);
			setActive(next * railSize);
			setRailShift((v) => v + 1);
		},
		[railPage, railSize, modal, clearHover, navigate],
	);
	useEffect(() => {
		const pop = () => {
			clearTransition();
			clearHover();
			const next = readLocation(posts);
			setMode(next.mode);
			setActive(next.active);
			const list = archiveLocation(location.search, posts.length);
			setArchivePage(list.page);
			setArchiveTag(list.tag);
			setChat(false);
			setSearch(false);
		};
		addEventListener("popstate", pop);
		return () => removeEventListener("popstate", pop);
	}, [clearTransition, clearHover]);
	useEffect(() => {
		const key = (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setChat(false);
				setSearch((v) => !v);
				setQuery("");
				return;
			}
			if (modal || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
			if (e.key === "Escape" && mode !== "matrix") navigate("matrix");
			if (mode === "matrix" && ["ArrowRight", "ArrowLeft"].includes(e.key)) {
				e.preventDefault();
				pageRail(e.key === "ArrowRight" ? 1 : -1);
			}
		};
		addEventListener("keydown", key);
		return () => removeEventListener("keydown", key);
	}, [modal, mode, navigate, pageRail]);
	useEffect(() => {
		const stage = mainRef.current;
		let start = null;
		const wheel = (e) => {
			if (mode !== "matrix" || modal || lock.current) return;
			e.preventDefault();
			const motion = wheelMotion.current;
			if (performance.now() - motion.last < 850) return;
			motion.total += e.deltaY;
			if (Math.abs(motion.total) > 70) {
				pageRail(motion.total > 0 ? 1 : -1);
				motion.total = 0;
				motion.last = performance.now();
			}
		};
		const down = (e) => {
			if (mode === "matrix")
				start = {
					x: e.changedTouches[0].clientX,
					y: e.changedTouches[0].clientY,
				};
		};
		const up = (e) => {
			if (!start) return;
			const dx = e.changedTouches[0].clientX - start.x,
				dy = e.changedTouches[0].clientY - start.y;
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy))
				pageRail(dx < 0 ? 1 : -1);
			else if (Math.abs(dy) > 60) pageRail(dy < 0 ? 1 : -1);
			start = null;
		};
		stage?.addEventListener("wheel", wheel, { passive: false });
		stage?.addEventListener("touchstart", down, { passive: true });
		stage?.addEventListener("touchend", up, { passive: true });
		return () => {
			stage?.removeEventListener("wheel", wheel);
			stage?.removeEventListener("touchstart", down);
			stage?.removeEventListener("touchend", up);
		};
	}, [mode, modal, pageRail]);
	const playSound = useCallback((kind) => {
		if (!siteMeta.soundEnabled) return;
		try {
			if (!audioRef.current || audioRef.current.isDisposed())
				audioRef.current = createSoundEngine();
			audioRef.current.setVisible(!document.hidden);
			void audioRef.current.play(kind);
		} catch {
			/* Browsers without Web Audio still support all navigation. */
		}
	}, []);
	useEffect(() => {
		const click = (event) => {
			if (event.button === 0) playSound("click");
		};
		window.addEventListener("pointerdown", click, {
			capture: true,
			passive: true,
		});
		return () => window.removeEventListener("pointerdown", click, true);
	}, [playSound]);
	const openChat = () => {
		setSearch(false);
		setChat(true);
	};
	const openSearch = () => {
		setChat(false);
		setSearch(true);
		setQuery("");
	};
	const playTyping = useCallback(() => playSound("type"), [playSound]);
	const hackerAction =
		transition === "targeting"
			? "lock"
			: transition === "deconstructing"
				? "decode"
				: paused
					? "idle"
					: hoveredCover !== null
						? "scan"
						: characterAction;
	const filtered = useMemo(() => searchArticles(posts, query), [posts, query]);
	const archivePosts = useMemo(
		() =>
			archiveTag
				? posts.filter((post) => post.tags.includes(archiveTag))
				: posts,
		[posts, archiveTag],
	);
	const pageCount = Math.max(
		1,
		Math.ceil(archivePosts.length / ARCHIVE_PAGE_SIZE),
	);
	const listPage = Math.min(archivePage, pageCount);
	const changeArchive = (page, tag = archiveTag) => {
		setArchivePage(page);
		setArchiveTag(tag);
		history.pushState({}, "", archivePath(page, tag));
		window.scrollTo({ top: 0, behavior: "instant" });
	};
	const visiblePosts = posts.slice(railStart, railStart + railSize);
	const openArticle = (index, event) => {
		if (lock.current) return;
		playSound("beam");
		const rect = event.currentTarget.getBoundingClientRect();
		navigate("reader", index, {
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height * 0.42,
		});
	};
	const copyCode = async (e) => {
		const button = e.target.closest("[data-copy-code]");
		if (!button) return;
		try {
			await navigator.clipboard.writeText(
				button.closest(".terminal-screen").querySelector("code").textContent,
			);
			button.textContent = "COPIED";
			later(() => {
				button.textContent = "COPY";
			}, 1600);
		} catch {
			button.textContent = "SELECT CODE";
		}
	};
	return (
		<div
			ref={appRef}
			style={syntaxTheme}
			onDragStartCapture={(event) => event.preventDefault()}
			className={`app mode-${mode} ${paused ? "paused" : ""} ${ready ? "ready" : ""} ${transition ? `transition-${transition}` : ""}`}
		>
			<canvas ref={canvasRef} className="matrix-canvas" aria-hidden="true" />
			{(mode === "about" || mode === "projects") && (
				<SceneBackdrop mode={mode} />
			)}
			<div className="scene-shade" aria-hidden="true" />
			<div className="film-grain" aria-hidden="true" />
			{failed && (
				<div className="render-notice" role="status">
					3D 渲染暂不可用，文章与菜单仍可使用。
				</div>
			)}
			<a className="skip-link" href="#main-content">
				跳转到内容
			</a>
			<header className="site-header" inert={modal ? true : undefined}>
				<div className="header-brand">
					<button
						className="wordmark"
						onClick={() => navigate("matrix")}
						aria-label={`${siteMeta.title}，返回文章矩阵`}
					>
						<span>
							<b>{siteMeta.brand}</b>
							<strong>{siteMeta.title}</strong>
						</span>
						<small>{siteMeta.tagline}</small>
					</button>
					{mode !== "matrix" && (
						<button className="nav-back" onClick={() => navigate("matrix")}>
							<ArrowLeft size={18} />
							<span>返回矩阵</span>
						</button>
					)}
				</div>
				<nav className="header-nav" aria-label="主导航">
					<button
						aria-current={mode === "list" ? "page" : undefined}
						onClick={() => navigate("list")}
					>
						<List size={16} />
						<span>文章列表</span>
					</button>
					<button onClick={openSearch}>
						<MagnifyingGlass size={16} />
						<span>搜索文章</span>
					</button>
					<button
						aria-current={mode === "projects" ? "page" : undefined}
						onClick={() => navigate("projects")}
					>
						<Code size={16} />
						<span>自研项目</span>
					</button>
					<button
						aria-current={mode === "about" ? "page" : undefined}
						onClick={() => navigate("about")}
					>
						<Fingerprint size={16} />
						<span>关于我</span>
					</button>
				</nav>
			</header>
			<main
				id="main-content"
				ref={mainRef}
				className="experience"
				tabIndex={-1}
				inert={modal ? true : undefined}
			>
				{mode === "matrix" ? (
					<>
						<div
							ref={neoRef}
							className={`neo-portrait hacker-portrait ${transition === "targeting" ? "neo-charged" : ""}`}
							data-action={hackerAction}
							aria-hidden="true"
						>
							<div className="neo-float">
								<CharacterLayers frames={hackerFrames} state={hackerAction} />
								<i className="neo-lens-glint" />
								<i className="neo-ground" />
							</div>
						</div>
						<div className="scene-intro">
							<h1>
								{siteMeta.heroTitle}
								<span>。</span>
							</h1>
							<p>{siteMeta.heroSubtitle}</p>
						</div>
						<section className="transmission-rail" aria-label="文章封面浏览">
							<div className="rail-heading">
								<div>
									<span className="live-mark" />
									<span>最新文章</span>
								</div>
								<div className="rail-controls">
									<span aria-live="polite">
										{pad(posts.length ? railStart + 1 : 0)}—
										{pad(Math.min(railStart + railSize, posts.length))}{" "}
										<i>
											/ {pad(posts.length)} · {railPage + 1} /{" "}
											{Math.max(
												1,
												Math.min(
													HOME_PAGE_COUNT,
													Math.ceil(posts.length / railSize),
												),
											)}
										</i>
									</span>
									<button
										aria-label="上一组文章"
										disabled={railPage === 0}
										onClick={() => pageRail(-1)}
									>
										<ArrowLeft size={20} />
									</button>
									<button
										aria-label="下一组文章"
										disabled={!posts.length}
										onClick={() => pageRail(1)}
									>
										<ArrowRight size={20} />
									</button>
								</div>
							</div>
							<div
								className="cover-rail"
								key={`${railStart}-${railShift}`}
								style={{ "--columns": railSize }}
							>
								{!posts.length && (
									<p className="empty-home" role="status">
										内容正在构建，敬请期待。
									</p>
								)}
								{visiblePosts.map((post) => {
									const index = posts.findIndex((p) => p.id === post.id);
									return (
										<a
											href={post.url}
											key={post.id}
											className={`cover-card ${transition && index === active ? "targeted" : ""}`}
											onClick={(e) => {
												if (
													e.button !== 0 ||
													e.metaKey ||
													e.ctrlKey ||
													e.shiftKey ||
													e.altKey
												)
													return;
												e.preventDefault();
												openArticle(index, e);
											}}
											onPointerEnter={(e) => hoverCover(index, e)}
											onPointerLeave={clearHover}
											onFocus={(e) => hoverCover(index, e)}
											onBlur={clearHover}
											aria-label={`阅读：${post.short}`}
										>
											<div className="rail-image">
												{post.image ? (
													<img
														src={post.image}
														onLoad={(event) =>
															event.currentTarget.parentElement.classList.add(
																"cover-loaded",
															)
														}
														alt={post.short}
														draggable="false"
														onError={(event) => {
															event.currentTarget.hidden = true;
															event.currentTarget.parentElement.classList.add(
																"cover-unavailable",
															);
														}}
													/>
												) : null}

												<span className="text-cover">
													<span>{post.topic}</span>
													<strong>{post.short}</strong>
												</span>
												<span className="cover-scan" />
												<span className="card-index">{pad(index + 1)}</span>
												<span className="card-read">
													<ArrowUpRight size={22} />
												</span>
											</div>
											<div className="card-meta">
												<span>{post.topic}</span>
												<small>{date(post.date)}</small>
											</div>
											<h2>{post.short}</h2>
										</a>
									);
								})}
							</div>
						</section>
					</>
				) : (
					<div className="content-shell" ref={scrollRef}>
						<div className="content-inner">
							{mode === "reader" && (
								<article className="reader" key={current.id}>
									<div className="overline">
										<span className="live-mark" />
										{current.topic}
										<span>/</span>
										{date(current.date)}
									</div>
									<h1 className="panel-heading" tabIndex={-1}>
										{(current.title.match(/[A-Za-z0-9_]+|\s+|./gu) || []).map(
											(glyph, i) => (
												<span
													className="title-glyph"
													key={i}
													style={{
														"--gdx": `${Math.sin(i * 2.1) * 38}vw`,
														"--gdy": `${Math.cos(i * 1.73) * 28}vh`,
														"--gdelay": `${Math.min(i * 0.012, 0.3)}s`,
													}}
												>
													{glyph}
												</span>
											),
										)}
									</h1>
									<div className="reader-byline">
										<span>{current.author || siteMeta.owner}</span>
										<span>
											{current.tags.slice(0, 3).join(" · ") ||
												"原创 · 技术拆解"}
										</span>
										<button
											aria-label="复制文章原站链接"
											onClick={async () => {
												try {
													await navigator.clipboard.writeText(
														new URL(current.url, siteMeta.url).href,
													);
													setCopied(true);
													later(() => setCopied(false), 1600);
												} catch {
													setCopied(false);
												}
											}}
										>
											{copied ? <Check size={16} /> : <Link size={16} />}
										</button>
									</div>
									{current.image && (
										<img
											className="reader-cover"
											draggable="false"
											src={current.image}
											onError={(e) => {
												e.currentTarget.onerror = null;
												e.currentTarget.src =
													"/assets/matrix/default-cover.svg";
											}}
											alt={current.short}
										/>
									)}
									<p className="reader-summary">{current.description}</p>
									{articleLoading && (
										<p className="article-load-status" role="status">
											正在载入文章…
										</p>
									)}
									{articleError && (
										<p className="article-load-status" role="alert">
											{articleError}，<a href={current.url}>重新打开文章</a>
										</p>
									)}
									<div
										ref={markdownRef}
										className="markdown"
										onClick={copyCode}
										dangerouslySetInnerHTML={{ __html: content }}
									/>
									<ArticleCredit
										post={current}
										copied={copied}
										onCopy={async () => {
											try {
												await navigator.clipboard.writeText(
													current.sourceLink ||
														new URL(current.url, siteMeta.url).href,
												);
												setCopied(true);
												later(() => setCopied(false), 1600);
											} catch {
												setCopied(false);
											}
										}}
									/>
									<nav className="reader-adjacent" aria-label="上一篇和下一篇">
										{active > 0 && (
											<a
												className="previous-article"
												href={posts[active - 1].url}
												onClick={(event) => {
													if (
														event.metaKey ||
														event.ctrlKey ||
														event.shiftKey ||
														event.altKey
													)
														return;
													event.preventDefault();
													navigate("reader", active - 1);
												}}
											>
												<span>
													<ArrowLeft size={18} /> 上一篇
												</span>
												<strong>{posts[active - 1].title}</strong>
											</a>
										)}
										{active < posts.length - 1 && (
											<a
												className="next-article"
												href={posts[active + 1].url}
												onClick={(event) => {
													if (
														event.metaKey ||
														event.ctrlKey ||
														event.shiftKey ||
														event.altKey
													)
														return;
													event.preventDefault();
													navigate("reader", active + 1);
												}}
											>
												<span>
													下一篇 <ArrowRight size={18} />
												</span>
												<strong>{posts[active + 1].title}</strong>
											</a>
										)}
									</nav>
								</article>
							)}
							{mode === "list" && (
								<div className="archive-layout">
									<section className="archive">
										<div className="archive-heading">
											<div>
												<div className="overline">
													{archivePosts.length} 篇文章
												</div>
												<h1 className="panel-heading" tabIndex={-1}>
													文章列表<span>。</span>
												</h1>
											</div>
											<span className="archive-page-label">
												{listPage} / {pageCount}
											</span>
										</div>
										{archiveTag && (
											<button
												className="archive-filter"
												onClick={() => changeArchive(1, "")}
											>
												{archiveTag}
												<X size={18} /> 清除筛选
											</button>
										)}
										<div className="archive-scroll">
											<ArticleResults
												posts={archivePosts.slice(
													(listPage - 1) * ARCHIVE_PAGE_SIZE,
													listPage * ARCHIVE_PAGE_SIZE,
												)}
												onSelect={(id) =>
													navigate(
														"reader",
														posts.findIndex((post) => post.id === id),
													)
												}
											/>
										</div>
										<nav className="archive-pagination" aria-label="文章分页">
											<button
												aria-label="上一页"
												disabled={listPage === 1}
												onClick={() => changeArchive(listPage - 1)}
											>
												<ArrowLeft size={20} />
											</button>
											{[
												...new Set(
													[
														1,
														listPage - 1,
														listPage,
														listPage + 1,
														pageCount,
													].filter((page) => page >= 1 && page <= pageCount),
												),
											]
												.sort((a, b) => a - b)
												.map((page, index, pages) => (
													<span key={page}>
														{index > 0 && page - pages[index - 1] > 1 && (
															<i>…</i>
														)}
														<a
															href={archivePath(page, archiveTag)}
															aria-current={
																page === listPage ? "page" : undefined
															}
															aria-label={`第 ${page} 页`}
															onClick={(event) => {
																if (
																	event.metaKey ||
																	event.ctrlKey ||
																	event.shiftKey ||
																	event.altKey
																)
																	return;
																event.preventDefault();
																changeArchive(page);
															}}
														>
															{page}
														</a>
													</span>
												))}
											<button
												aria-label="下一页"
												disabled={listPage === pageCount}
												onClick={() => changeArchive(listPage + 1)}
											>
												<ArrowRight size={20} />
											</button>
										</nav>
									</section>
									<TagCloud
										posts={posts}
										selected={archiveTag}
										onSelect={(tag) => changeArchive(1, tag)}
										paused={paused || modal}
									/>
								</div>
							)}
							{mode === "projects" && (
								<section className="project-section">
									<div className="overline">
										<span className="live-mark" /> THE CONSTRUCT / INDEPENDENT
										LAB
									</div>
									<h1 className="panel-heading" tabIndex={-1}>
										{siteMeta.projectPage.title}
										<span>。</span>
									</h1>
									<p className="section-intro">
										{siteMeta.projectPage.description}
									</p>
									<div className="project-list">
										{!projects.length && (
											<p className="empty-projects">新的构想，正在路上。</p>
										)}
										{projects.map((p, i) => (
											<a
												key={p.name}
												href={p.url}
												target="_blank"
												rel="noreferrer"
											>
												<div className="project-topline">
													<span className="project-index">
														{pad(i + 1)} / {p.tag.split(" / ")[0]}
													</span>
													<ArrowUpRight size={22} />
												</div>
												<div>
													<small>{p.kind}</small>
													<h2>{p.name}</h2>
													<p>{p.description}</p>
												</div>
												<div className="project-bottomline">
													<span>进入项目</span>
													<i />
												</div>
											</a>
										))}
									</div>
									<div className="scene-signature">
										BUILT WITH CURIOSITY{" "}
										<span>
											● {pad(projects.length)} PROJECTS IN THE CONSTRUCT
										</span>
									</div>
								</section>
							)}
							{mode === "about" && (
								<section className="about-section">
									<div className="overline">
										<span className="live-mark" /> THE ORIGIN / HUMAN CONNECTION
									</div>
									<div className="origin-card">
										<div className="origin-card-top">
											<Fingerprint size={26} />
											<span>IDENTITY / {siteMeta.brand}</span>
											<i />
										</div>
										<h1 className="panel-heading" tabIndex={-1}>
											我是{siteMeta.owner}
											<span>。</span>
										</h1>
										<p className="about-lead">{siteMeta.about.lead}</p>
										<p className="about-copy">{siteMeta.about.description}</p>
										<div className="about-principles">
											{siteMeta.about.principles.map((text) => (
												<span key={text}>{text}</span>
											))}
										</div>
										<div className="about-links">
											<a
												href={siteMeta.github}
												target="_blank"
												rel="noreferrer"
											>
												<GithubLogo size={20} /> GitHub
												<ArrowUpRight size={15} />
											</a>
											<button onClick={() => navigate("projects")}>
												<Code size={20} /> 自研项目
												<ArrowRight size={16} />
											</button>
											<a href="/rss.xml" target="_blank" rel="noreferrer">
												RSS
												<ArrowUpRight size={15} />
											</a>
										</div>
									</div>
									<div className="scene-signature">
										{siteMeta.about.signature} <span>● {siteMeta.brand}</span>
									</div>
								</section>
							)}
						</div>
					</div>
				)}
			</main>
			<footer className="experience-footer" inert={modal ? true : undefined}>
				<section className="footer-meta" aria-label="版权与主题信息">
					<span className="footer-credits">
						<span>
							© {new Date().getFullYear()} {siteMeta.owner}
						</span>
						<span className="footer-theme">
							主题{" "}
							{siteMeta.themeRepository ? (
								<a
									href={siteMeta.themeRepository}
									target="_blank"
									rel="noopener noreferrer"
								>
									{siteMeta.themeName}
								</a>
							) : (
								<span>{siteMeta.themeName}</span>
							)}
						</span>
					</span>
					{mode === "matrix" && siteMeta.filingNumber && (
						<a
							className="filing-link"
							href={siteMeta.filingUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							{siteMeta.filingNumber}
						</a>
					)}
				</section>
			</footer>
			<div
				className={`agent-dock ${chat ? "agent-open" : ""}`}
				inert={modal ? true : undefined}
			>
				<button
					ref={agentButtonRef}
					className="agent-trigger"
					onPointerEnter={() => setAgentHovered(true)}
					onPointerLeave={() => setAgentHovered(false)}
					onClick={openChat}
					aria-label="进入矩阵，打开 AI 对话"
					aria-haspopup="dialog"
					aria-expanded={chat}
					aria-controls="matrix-chat"
				>
					<span className="agent-aura" />
					<span className="agent-portrait" aria-hidden="true">
						<CharacterLayers
							frames={operatorFrames}
							state={
								chat ? "connected" : agentHovered && !paused ? "alert" : "idle"
							}
						/>
						<i className="agent-lens-glint" />
					</span>
					<span className="agent-tag">进入矩阵</span>
				</button>
			</div>
			{chat && (
				<ChatDialog
					dialogRef={chatRef}
					onClose={closeChat}
					onTyping={playTyping}
				/>
			)}
			{search && (
				<div
					className="modal-backdrop"
					onClick={(e) => {
						if (e.target === e.currentTarget) setSearch(false);
					}}
				>
					<section
						className="search-panel"
						ref={searchRef}
						role="dialog"
						aria-modal="true"
						aria-label="搜索文章"
					>
						<div className="search-field">
							<MagnifyingGlass size={23} />
							<input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="搜索文章、技术与关键词…"
							/>
							<button aria-label="关闭搜索" onClick={closeSearch}>
								<X size={22} />
							</button>
						</div>
						{query.trim() && (
							<>
								<div className="search-label">
									搜索结果<span>{filtered.length} 篇</span>
								</div>
								<ArticleResults
									posts={filtered.slice(0, 8)}
									onSelect={(id) =>
										navigate(
											"reader",
											posts.findIndex((post) => post.id === id),
										)
									}
									compact
								/>
								{filtered.length > 8 && (
									<div className="search-footnote">
										显示前 8 条结果，输入更多关键词可缩小范围。
									</div>
								)}
							</>
						)}
					</section>
				</div>
			)}
			{beam && (
				<div className="beam-overlay" aria-hidden="true">
					<i
						className="eye-beam beam-glow"
						style={{
							left: beam.x,
							top: beam.y,
							width: beam.length,
							rotate: `${beam.angle}deg`,
						}}
					/>
					<i
						className="eye-beam beam-core"
						style={{
							left: beam.x,
							top: beam.y,
							width: beam.length,
							rotate: `${beam.angle}deg`,
						}}
					/>
					<i className="beam-impact" style={{ left: beam.tx, top: beam.ty }} />
				</div>
			)}
			<div className="shockwave" aria-hidden="true" />
			{!!burst.length && (
				<div className="word-burst" aria-hidden="true">
					{burst.map((word, i) => (
						<span
							key={i}
							style={{
								"--dx": `${Math.sin(i * 2.399) * 48}vw`,
								"--dy": `${Math.cos(i * 1.71) * 45}vh`,
								"--rz": `${((i % 5) - 2) * 9}deg`,
								"--delay": `${(i % 12) * 0.018}s`,
								"--size": `${10 + (i % 5) * 3}px`,
							}}
						>
							{word}
						</span>
					))}
				</div>
			)}
			{transition && (
				<div className="transition-status" aria-hidden="true">
					{transition === "targeting"
						? "SIGNAL LOCKED"
						: transition === "deconstructing"
							? "REALITY IS RECONSTRUCTING"
							: "TRANSMISSION DECODED"}
					<small>
						{transition === "targeting" ? "正在锁定文章" : "意识正在重组内容"}
					</small>
				</div>
			)}
			{diagnostics && Diagnostics && (
				<Suspense fallback={null}>
					<Diagnostics read={readDiagnostics} />
				</Suspense>
			)}
			{!ready && (
				<div className="boot-screen">
					<span>{siteMeta.brand}</span>
					<small>RECONSTRUCTING REALITY</small>
				</div>
			)}
		</div>
	);
}
function ArticleResults({ posts: results, onSelect, compact }) {
	return (
		<div className={`article-results ${compact ? "compact" : ""}`}>
			{results.length ? (
				results.map((post) => (
					<a
						className="article-result"
						href={post.url}
						key={post.id}
						onClick={(e) => {
							if (
								e.button !== 0 ||
								e.metaKey ||
								e.ctrlKey ||
								e.shiftKey ||
								e.altKey
							)
								return;
							e.preventDefault();
							onSelect(post.id);
						}}
					>
						{post.image && (
							<img
								src={post.image}
								alt=""
								loading="lazy"
								onError={(event) => {
									event.currentTarget.hidden = true;
								}}
								draggable="false"
							/>
						)}
						<div>
							<small>
								{post.topic}
								<span>/</span>
								{date(post.date)}
							</small>
							<h2>{post.short}</h2>
							{!compact && <p>{post.description}</p>}
						</div>
						<CaretRight size={20} />
					</a>
				))
			) : (
				<div className="empty-results">
					<MagnifyingGlass size={26} />
					<p>没有找到相关文章</p>
					<span>试试 AI、AWS 或 Agent。</span>
				</div>
			)}
		</div>
	);
}

function CharacterLayers({ frames, state }) {
	return (
		<span className="character-layers">
			{Object.entries(frames).map(([name, src]) => (
				<img
					key={name}
					className={`character-state ${name === state ? "is-active" : ""}`}
					src={src}
					alt=""
					draggable="false"
					decoding="async"
				/>
			))}
		</span>
	);
}

function SceneBackdrop({ mode }) {
	const about = mode === "about";
	return (
		<div className={`scene-art scene-art-${mode}`} aria-hidden="true">
			<img
				className="scene-art-image"
				src={about ? art.world : art.city}
				alt=""
				draggable="false"
			/>
			<div className="scene-art-vignette" />
			{about ? (
				<>
					<div className="map-sweep" />
					<div className="map-radar" />
					{[
						[44, 37],
						[61, 30],
						[74, 42],
						[83, 65],
						[54, 64],
					].map(([x, y], i) => (
						<span
							key={i}
							className="map-beacon"
							style={{ left: `${x}%`, top: `${y}%`, "--delay": `${i * 0.7}s` }}
						>
							<i />
						</span>
					))}
					<div className="world-caption">
						<span>BEYOND THE INTERFACE</span>
						<b>EVERY IDEA IS A CONNECTION.</b>
						<i>EXPLORE · UNDERSTAND · CREATE</i>
					</div>
				</>
			) : (
				<>
					<div className="reactor-bloom" />
					<div className="city-light-shaft" />
					<div className="city-mist" />
					{Array.from({ length: 18 }, (_, i) => (
						<i
							key={i}
							className="city-ember"
							style={{
								"--left": `${38 + ((i * 17) % 62)}%`,
								"--duration": `${8 + (i % 7)}s`,
								"--delay": `${-i * 0.9}s`,
								"--drift": `${i % 2 ? -35 : 25}px`,
							}}
						/>
					))}
					<div className="world-caption">
						<span>THE MACHINE NEVER STOPS</span>
						<b>IDEAS BECOME SYSTEMS.</b>
						<i>DESIGN · ENGINEER · SHIP</i>
					</div>
				</>
			)}
		</div>
	);
}
