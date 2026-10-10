import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowClockwise, Stop, X } from "@phosphor-icons/react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { highlightCode } from "./syntax-highlighting.js";
import { readEventStream } from "./lib/event-stream.js";

import {
	CHAT_LIMIT,
	clearSessionHistory,
	loadSession,
	saveSession,
	conversationHistory,
} from "./lib/chat-session.js";
const suggestions = [
	"如何设计一个可靠的 AI Agent？",
	"聊聊大模型应用的技术架构",
	"帮我分析一个开发难题",
];
function Answer({ text }) {
	const [copyState, setCopyState] = useState(null),
		resetCopy = useRef(null);
	useEffect(() => () => clearTimeout(resetCopy.current), []);
	const html = useMemo(() => {
		const renderer = new marked.Renderer();
		renderer.code = ({ text, lang }) => {
			const highlighted = highlightCode(text, lang || "");
			return `<pre tabindex="0"><code class="hljs language-${highlighted.language}">${highlighted.html}</code></pre>`;
		};
		renderer.image = () => ""; // Model output cannot request remote image resources.
		const sanitized = DOMPurify.sanitize(marked.parse(text, { renderer }), {
			FORBID_TAGS: ["img", "form", "input", "button", "style"],
			FORBID_ATTR: ["style"],
		});
		// Add our own controls after sanitizing: model-provided buttons stay forbidden.
		const template = document.createElement("template");
		template.innerHTML = sanitized;
		template.content.querySelectorAll("pre").forEach((pre, index) => {
			const code = pre.querySelector("code");
			if (!code) return;
			const frame = document.createElement("section");
			frame.className = "chat-code-frame";
			const bar = document.createElement("div");
			bar.className = "chat-code-bar";
			const label = document.createElement("span");
			label.textContent =
				code.className.match(/language-([\w-]+)/)?.[1]?.toUpperCase() || "CODE";
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.copyChatCode = String(index);
			button.textContent =
				copyState?.index === index ? copyState.label : "复制代码";
			button.setAttribute("aria-label", "复制这段代码");
			bar.append(label, button);
			pre.replaceWith(frame);
			frame.append(bar, pre);
		});
		return template.innerHTML;
	}, [text, copyState]);
	const copyCode = async (event) => {
		const button = event.target.closest("button[data-copy-chat-code]");
		if (!button) return;
		const code = button.closest(".chat-code-frame")?.querySelector("pre code");
		if (!code) return;
		const index = Number(button.dataset.copyChatCode),
			source = code.textContent;
		clearTimeout(resetCopy.current);
		try {
			if (navigator.clipboard?.writeText)
				await navigator.clipboard.writeText(source);
			else {
				const field = document.createElement("textarea"),
					previous = document.activeElement;
				field.value = source;
				field.readOnly = true;
				field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
				// Keep the fallback inside the active dialog, so modal focus trapping permits it.
				button.closest('[role="dialog"]').append(field);
				try {
					field.select();
					if (!document.execCommand("copy"))
						throw new Error("Copy unavailable");
				} finally {
					field.remove();
					previous?.focus?.({ preventScroll: true });
				}
			}
			setCopyState({ index, label: "已复制 ✓" });
		} catch {
			setCopyState({ index, label: "复制失败，请选中复制" });
		}
		resetCopy.current = setTimeout(() => setCopyState(null), 1800);
	};
	return (
		<>
			<div
				className="chat-markdown"
				onClick={copyCode}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			<span className="chat-announcement" role="status">
				{copyState?.label || ""}
			</span>
		</>
	);
}
export function ChatDialog({ dialogRef, onClose, onTyping }) {
	const restored = useRef(loadSession(localStorage)).current;
	const [messages, setMessages] = useState(restored.messages),
		[input, setInput] = useState("");
	const [used, setUsed] = useState(restored.used),
		[configured, setConfigured] = useState(false);

	const [loading, setLoading] = useState(true),
		[streaming, setStreaming] = useState(false),
		[error, setError] = useState("");
	const pending = useRef(null),
		busy = useRef(false),
		generation = useRef(0);
	const saved = useRef({ messages, used });
	saved.current = { messages, used };
	const listRef = useRef(null),
		inputRef = useRef(null),
		follow = useRef(true);
	useEffect(() => {
		const timer = setTimeout(
			() => saveSession(localStorage, saved.current),
			180,
		);
		return () => clearTimeout(timer);
	}, [messages, used]);
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/chat/status", { signal: controller.signal, cache: "no-store" })
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok) throw new Error(data.message || "助手暂时无法连接");
				setConfigured(data.configured);
				if (!data.configured) setError("助手暂未连接，请稍后再试。");
			})
			.catch((failure) => {
				if (!controller.signal.aborted)
					setError(failure.message || "助手暂时无法连接");
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => {
			controller.abort();
			generation.current++;
			pending.current?.abort();
			saveSession(localStorage, saved.current);
		};
	}, []);
	useEffect(() => {
		if (follow.current && listRef.current)
			listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [messages, streaming, loading]);
	const send = async (event) => {
		event?.preventDefault();
		const question = input.trim();
		if (
			busy.current ||
			loading ||
			!configured ||
			used >= CHAT_LIMIT ||
			!question
		)
			return;
		const version = generation.current,
			history = conversationHistory(messages);
		busy.current = true;
		setStreaming(true);
		setError("");
		setInput("");
		follow.current = true;
		saved.current = { ...saved.current, used: Math.min(CHAT_LIMIT, used + 1) };
		saveSession(localStorage, saved.current);
		setUsed(saved.current.used);
		const id = crypto.randomUUID(),
			controller = new AbortController();
		pending.current = controller;
		let answer = "",
			finished = false;
		setMessages((previous) => [
			...previous,
			{ id: `${id}-user`, role: "user", content: question },
			{ id, role: "assistant", content: "", status: "streaming" },
		]);
		const updateAnswer = (status) => {
			if (version === generation.current)
				setMessages((previous) =>
					previous.map((message) =>
						message.id === id
							? { ...message, content: answer, status }
							: message,
					),
				);
		};
		try {
			const response = await fetch("/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "text/event-stream",
				},
				body: JSON.stringify({ message: question, history }),
				signal: controller.signal,
			});
			if (!response.ok) {
				if (version === generation.current)
					setUsed((value) => Math.max(0, value - 1));
				const data = await response.json();
				throw new Error(data.message || "发送失败，请稍后再试");
			}
			if (
				!response.body ||
				!response.headers.get("content-type")?.includes("text/event-stream")
			)
				throw new Error("助手暂时不可用，请稍后再试。");
			for await (const frame of readEventStream(response.body)) {
				if (version !== generation.current) break;
				const data = JSON.parse(frame.data);
				if (frame.event === "delta") {
					answer += data.text || "";
					updateAnswer("streaming");
				} else if (frame.event === "done") {
					finished = true;
					updateAnswer("complete");
				} else if (frame.event === "error")
					throw new Error(data.message || "回复中断");
			}
			if (!finished && version === generation.current)
				throw new Error("回复中断，可以继续提问。");
		} catch (failure) {
			updateAnswer("interrupted");
			if (version === generation.current && !controller.signal.aborted)
				setError(failure.message || "连接中断，请稍后再试");
		} finally {
			if (version === generation.current) {
				pending.current = null;
				busy.current = false;
				setStreaming(false);
				inputRef.current?.focus({ preventScroll: true });
			}
		}
	};
	const startNew = () => {
		generation.current++;
		pending.current?.abort();
		pending.current = null;
		busy.current = false;
		const empty = clearSessionHistory(saved.current);
		saved.current = empty;
		saveSession(localStorage, empty);
		setMessages([]);
		setUsed(empty.used);
		setInput("");
		setStreaming(false);
		setError(configured ? "" : "助手暂未连接，请稍后再试。");
		inputRef.current?.focus();
	};
	const unavailable = loading || !configured || used >= CHAT_LIMIT;
	return (
		<div
			className="chat-backdrop"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				id="matrix-chat"
				className="chat-dialog"
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="chat-title"
			>
				<header className="chat-header">
					<div>
						<h2 id="chat-title">
							矩阵对话<span>_</span>
						</h2>
					</div>
					<div className="chat-header-actions">
						<button
							onClick={startNew}
							title="清空聊天记录"
							aria-label="清空聊天记录"
						>
							<ArrowClockwise size={19} />
						</button>
						<button onClick={onClose} aria-label="关闭对话">
							<X size={23} />
						</button>
					</div>
				</header>
				<div
					className="chat-messages"
					ref={listRef}
					role="log"
					aria-label="聊天记录"
					aria-live="off"
					onScroll={() => {
						const node = listRef.current;
						follow.current =
							node.scrollHeight - node.scrollTop - node.clientHeight < 80;
					}}
				>
					{!messages.length && (
						<div className="chat-welcome">
							<span className="chat-orbit" aria-hidden="true">
								<i />
								<b>M</b>
							</span>
							<h3>你想探索什么？</h3>
							<p>
								AI、代码、系统架构。
								<br />
								从你的第一个问题开始。
							</p>
							<div className="chat-suggestions">
								{suggestions.map((question) => (
									<button
										key={question}
										disabled={unavailable}
										onClick={() => {
											setInput(question);
											inputRef.current?.focus();
										}}
									>
										{question}
										<ArrowUp size={14} />
									</button>
								))}
							</div>
						</div>
					)}
					{messages.map((message) => (
						<div
							key={message.id}
							className={`chat-message chat-${message.role}`}
						>
							<span className="chat-speaker">
								{message.role === "user" ? "YOU" : "MATRIX"}
							</span>
							<div className="chat-bubble">
								{message.role === "user" ? (
									<p>{message.content}</p>
								) : message.content ? (
									<Answer text={message.content} />
								) : (
									<span className="chat-wait">
										{message.status === "streaming"
											? "正在思考…"
											: "回复未完成"}
										<i />
									</span>
								)}
								{message.status === "streaming" && message.content && (
									<span className="chat-cursor" aria-hidden="true" />
								)}
								{message.status === "interrupted" && message.content && (
									<small className="chat-interrupted">回复已停止</small>
								)}
							</div>
						</div>
					))}
				</div>
				<div className="chat-announcement" role="status" aria-live="polite">
					{streaming ? "助手正在回复" : messages.length ? "回复已结束" : ""}
				</div>
				<form className="chat-composer" onSubmit={send}>
					{error && (
						<p className="chat-error" role="alert">
							{error}
						</p>
					)}
					{!loading && used >= CHAT_LIMIT && (
						<p className="chat-error">本次可用对话已结束，感谢你的交流。</p>
					)}
					<div className="chat-input-wrap">
						<textarea
							ref={inputRef}
							value={input}
							disabled={unavailable}
							maxLength={2000}
							rows={2}
							placeholder={
								used >= CHAT_LIMIT
									? "暂时无法继续提问"
									: "输入问题，进入更深的矩阵…"
							}
							aria-label="你的问题"
							onChange={(event) => {
								const next = event.target.value;
								setInput(next);
								if (next !== input) onTyping();
							}}
							onKeyDown={(event) => {
								const composing =
									event.nativeEvent.isComposing || event.keyCode === 229;
								if (
									!event.metaKey &&
									!event.ctrlKey &&
									(!event.altKey || event.getModifierState("AltGraph")) &&
									(event.key.length === 1 ||
										["Backspace", "Delete", "Process", "Unidentified"].includes(
											event.key,
										) ||
										composing ||
										(event.key === "Enter" && event.shiftKey))
								)
									onTyping();
								if (event.key === "Enter" && !event.shiftKey && !composing) {
									event.preventDefault();
									if (!streaming) void send();
								}
							}}
						/>
						{streaming ? (
							<button
								type="button"
								className="chat-send chat-stop"
								onClick={() => pending.current?.abort()}
								aria-label="停止回复"
								title="停止回复"
							>
								<Stop size={19} weight="fill" />
							</button>
						) : (
							<button
								type="submit"
								className="chat-send"
								disabled={unavailable || !input.trim()}
								aria-label="发送问题"
								title="发送问题"
							>
								<ArrowUp size={22} weight="bold" />
							</button>
						)}
					</div>
					<div className="chat-composer-note">
						<span>Enter 发送 · Shift + Enter 换行</span>
						<span>{input.length}/2000</span>
					</div>
					<p className="chat-disclosure">AI 回复仅供参考</p>
				</form>
			</section>
		</div>
	);
}
