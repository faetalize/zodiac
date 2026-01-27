function clampGuard(value: unknown): number {
    const n = Math.trunc(Number(value));
    if (Number.isNaN(n)) return 0;
    return Math.max(1, Math.min(10, n));
}

export function defaultGuardFromIndependence(independence: unknown): number {
    const i = Math.max(0, Math.min(3, Math.trunc(Number(independence) || 0)));
    const map: Record<number, number> = { 0: 3, 1: 4, 2: 5, 3: 6 };
    return map[i] ?? 5;
}

export function normalizeGuardMap(args: {
    participantIds: string[];
    existing?: Record<string, unknown>;
    legacyFallback?: unknown;
    defaultForId?: (id: string) => number;
}): Record<string, number> {
    const out: Record<string, number> = {};
    const legacy = clampGuard(args.legacyFallback);

    for (const id of args.participantIds) {
        const fromExisting = clampGuard(args.existing?.[id]);
        if (fromExisting) {
            out[id] = fromExisting;
            continue;
        }

        if (legacy) {
            out[id] = legacy;
            continue;
        }

        out[id] = args.defaultForId?.(id) ?? 5;
    }

    return out;
}

export function resolveGuardForPersona(dynamicSettings: any, personaId: string): number {
    const byId = dynamicSettings?.maxMessageGuardById;
    const mapVal = byId ? clampGuard(byId[personaId]) : 0;
    if (mapVal) return mapVal;

    const legacy = clampGuard(dynamicSettings?.maxMessageGuard);
    if (legacy) return legacy;

    return 5;
}

export { clampGuard };
