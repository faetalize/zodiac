import { Message } from "./Message";

export interface Chat {
    title: string;
    timestamp: number;
    content: Array<Message>;
}

export interface DbChat extends Chat {
    id: number;
}