import { onRequest } from "../server/chat/handler.mjs";
export default {
	fetch(request) {
		return onRequest({ request, env: process.env });
	},
};
