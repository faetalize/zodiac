export async function waitForCondition(
    condition: () => Promise<boolean> | boolean,
    message: string,
    options: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
    const attempts = options.attempts ?? 40;
    const delayMs = options.delayMs ?? 0;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (await condition()) {
            return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    throw new Error(message);
}
