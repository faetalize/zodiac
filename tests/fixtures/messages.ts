import type { Message } from "../../src/types/Message";

export function makeUserMessage(text: string, overrides: Partial<Message> = {}): Message {
	return {
		role: "user",
		parts: [{ text }],
		...overrides
	};
}

export function makeModelMessage(text: string, overrides: Partial<Message> = {}): Message {
	return {
		role: "model",
		parts: [{ text }],
		...overrides
	};
}
