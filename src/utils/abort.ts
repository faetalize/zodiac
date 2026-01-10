/**
 * Abort error utilities.
 * Provides consistent abort error creation and detection.
 */

/**
 * Creates and throws an AbortError.
 */
export function throwAbortError(): never {
    const err = new Error("Aborted");
    (err as any).name = "AbortError";
    throw err;
}

/**
 * Creates an AbortError without throwing it.
 */
export function createAbortError(): Error {
    const err = new Error("Aborted");
    (err as any).name = "AbortError";
    return err;
}

/**
 * Checks if an error is an abort error.
 */
export function isAbortError(error: unknown, abortController?: AbortController): boolean {
    return (
        (error as any)?.name === "AbortError" ||
        (abortController?.signal.aborted ?? false)
    );
}
