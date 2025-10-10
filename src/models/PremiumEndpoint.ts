import { Content, type GenerateContentConfig } from "@google/genai";

export namespace PremiumEndpoint {
    export interface Request {
        message: string;
        settings: RequestSettings;
        history: Content[];
    }

    export interface RequestSettings extends GenerateContentConfig {
        model: string;
        streamResponses: boolean;
        generate?: boolean; // whether to generate a new response or just continue the chat
    }
}
