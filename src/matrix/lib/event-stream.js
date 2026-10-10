// Shared by the browser and local proxy. Decodes UTF-8 across arbitrary chunks.
export async function* readEventStream(stream, maxFrameLength = 131072) {
	const reader = stream.getReader(),
		decoder = new TextDecoder();
	let pending = "",
		event = "message",
		data = [],
		finished = false;
	const line = (value) => {
		if (value.endsWith("\r")) value = value.slice(0, -1);
		if (!value) {
			const result = data.length ? { event, data: data.join("\n") } : null;
			event = "message";
			data = [];
			return result;
		}
		if (value.startsWith(":")) return null;
		const colon = value.indexOf(":");
		const field = colon < 0 ? value : value.slice(0, colon);
		let content = colon < 0 ? "" : value.slice(colon + 1);
		if (content.startsWith(" ")) content = content.slice(1);
		if (field === "event") event = content;
		if (field === "data") data.push(content);
		if (data.reduce((sum, item) => sum + item.length, 0) > maxFrameLength)
			throw new Error("Stream frame too large");
		return null;
	};
	try {
		while (true) {
			const chunk = await reader.read();
			pending += chunk.done
				? decoder.decode()
				: decoder.decode(chunk.value, { stream: true });
			let newline;
			while ((newline = pending.indexOf("\n")) !== -1) {
				const parsed = line(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
				if (parsed) yield parsed;
			}
			if (pending.length > maxFrameLength)
				throw new Error("Stream frame too large");
			if (chunk.done) {
				finished = true;
				break;
			}
		}
		if (pending) {
			const parsed = line(pending);
			if (parsed) yield parsed;
		}
		const last = line("");
		if (last) yield last;
	} finally {
		if (!finished) await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
