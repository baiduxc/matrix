import fs from "node:fs";
import { parseEnv } from "node:util";
import { Readable } from "node:stream";
import { once } from "node:events";
import { onRequest as chat } from "../edge-functions/api/chat/index.js";
import { onRequest as status } from "../edge-functions/api/chat/status.js";
export function matrixChatDev() {
	return {
		name: "matrix-chat-local",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const path = (req.url || "").split("?")[0].replace(/\/$/, "");
				if (!["/api/chat", "/api/chat/status"].includes(path)) return next();
				const controller = new AbortController();
				res.on("close", () => controller.abort());
				try {
					const env = { ...process.env };
					for (const file of [".env", ".env.local"])
						if (fs.existsSync(file))
							Object.assign(env, parseEnv(fs.readFileSync(file, "utf8")));
					const init = {
						method: req.method,
						headers: req.headers,
						signal: controller.signal,
					};
					if (!["GET", "HEAD"].includes(req.method)) {
						init.body = Readable.toWeb(req);
						init.duplex = "half";
					}
					const request = new Request(
						`http://${req.headers.host}${req.url}`,
						init,
					);
					const response = await (path.endsWith("/status") ? status : chat)({
						request,
						env,
					});
					res.writeHead(response.status, Object.fromEntries(response.headers));
					if (response.body)
						for await (const chunk of response.body) {
							if (res.destroyed) break;
							if (!res.write(chunk))
								await once(res, "drain", { signal: controller.signal });
						}
					if (!res.destroyed) res.end();
				} catch {
					if (!res.headersSent) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ message: "本地聊天服务暂时无法连接" }));
					} else if (!res.destroyed) res.end();
				}
			});
		},
	};
}
