export interface MockTextResponse {
    text: string;
    thinking?: string;
}

export function createMockTextResponse(text: string, thinking?: string): MockTextResponse {
    return { text, thinking };
}

export async function collectAsyncIterable<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of iterable) {
        values.push(value);
    }
    return values;
}

export async function* streamTextChunks(chunks: string[]): AsyncGenerator<string> {
    for (const chunk of chunks) {
        yield chunk;
    }
}
