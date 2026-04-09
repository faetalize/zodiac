import type { DbPersonality } from "../../src/types/Personality";

export function makePersona(overrides: Partial<DbPersonality> = {}): DbPersonality {
	const now = Date.now();

	return {
		id: overrides.id ?? "persona-test-id",
		name: overrides.name ?? "Test Persona",
		image: overrides.image ?? "https://example.com/persona.png",
		description: overrides.description ?? "A test persona",
		prompt: overrides.prompt ?? "Be helpful.",
		aggressiveness: overrides.aggressiveness ?? 50,
		sensuality: overrides.sensuality ?? 0,
		independence: overrides.independence ?? 50,
		nsfw: overrides.nsfw ?? false,
		internetEnabled: overrides.internetEnabled ?? false,
		roleplayEnabled: overrides.roleplayEnabled ?? true,
		toneExamples: overrides.toneExamples ?? [],
		tags: overrides.tags ?? [],
		category: overrides.category ?? "character",
		dateAdded: overrides.dateAdded ?? now,
		lastModified: overrides.lastModified ?? now,
		syncedFrom: overrides.syncedFrom,
		version: overrides.version,
		localModifications: overrides.localModifications
	};
}
