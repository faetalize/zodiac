export const MENTION_RE_GLOBAL = /@<?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>?/g;
export const MENTION_RE = /@<?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>?/;

/**
 * Extracts mentioned participant IDs from message content.
 *
 * Dynamic group chats use @<uuid> mentions (not names).
 */
export function extractMentionedParticipantIds(text: string, participantIds: string[]): string[] {
    const raw = (text ?? "").toString();
    const allowed = new Set((participantIds ?? []).map(v => String(v)));
    const found = new Set<string>();

    for (const match of raw.matchAll(MENTION_RE_GLOBAL)) {
        const id = String(match[1] ?? "");
        if (!id) continue;
        if (allowed.has(id)) {
            found.add(id);
        }
    }

    return Array.from(found);
}
