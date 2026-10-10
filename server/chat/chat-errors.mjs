export class ChatError extends Error {
	constructor(status, code, message) {
		super(message);
		Object.assign(this, { status, code });
	}
}
