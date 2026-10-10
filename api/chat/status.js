import { onRequest } from "../../server/chat/status-handler.mjs";
export default {
	fetch(request) {
		return onRequest({ request, env: process.env });
	},
};
