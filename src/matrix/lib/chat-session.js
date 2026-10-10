export const CHAT_LIMIT = 50;
export const CHAT_SESSION_KEY = "matrix.chat.v1";
export function normalizeSession(value) {
	const used = Math.max(
		0,
		Math.min(CHAT_LIMIT, Number.isInteger(value?.used) ? value.used : 0),
	);
	const messages = Array.isArray(value?.messages)
		? value.messages
				.filter(
					(item) =>
						item &&
						["user", "assistant"].includes(item.role) &&
						typeof item.content === "string",
				)
				.slice(-100)
				.map((item, index) => ({
					id: typeof item.id === "string" ? item.id : `restored-${index}`,
					role: item.role,
					content: item.content.slice(0, 14000),
					status:
						item.status === "streaming"
							? "interrupted"
							: item.status || "complete",
				}))
		: [];
	return { used, messages };
}
export function loadSession(storage) {
	try {
		return normalizeSession(
			JSON.parse(storage.getItem(CHAT_SESSION_KEY) || "{}"),
		);
	} catch {
		return { used: 0, messages: [] };
	}
}
export function saveSession(storage, session) {
	try {
		storage.setItem(CHAT_SESSION_KEY, JSON.stringify(session));
	} catch {
		/* Private browsing/storage full. */
	}
}
// Only complete user/assistant pairs enter model context; the latest question is separate.
export function conversationHistory(messages) {
	const pairs = [];
	for (let index = 0; index < messages.length - 1; index++) {
		const question = messages[index],
			answer = messages[index + 1];
		if (
			question.role === "user" &&
			answer.role === "assistant" &&
			answer.status === "complete" &&
			answer.content
		) {
			pairs.push([
				{ role: "user", content: question.content },
				{ role: "assistant", content: answer.content },
			]);
			index++;
		}
	}
	const selected = [];
	let length = 0;
	for (const pair of pairs.slice(-8).reverse()) {
		const size = pair[0].content.length + pair[1].content.length;
		if (length + size > 16000) break;
		selected.unshift(...pair);
		length += size;
	}
	return selected;
}

export function clearSessionHistory(session) {
	return { used: normalizeSession(session).used, messages: [] };
}
