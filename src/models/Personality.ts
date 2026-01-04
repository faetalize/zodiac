import type { Database } from '../types/database.types'

// Use Supabase enum as source of truth
export type PersonaCategory = Database['public']['Enums']['persona_category']

/**
 * Core personality/persona properties shared across local and marketplace contexts.
 */
export interface Personality {
    name: string;
    image: string;
    description: string;
    prompt: string;
    aggressiveness: number;
    sensuality: number;
    independence: number;
    nsfw: boolean;
    internetEnabled: boolean;
    roleplayEnabled: boolean;
    toneExamples: string[];
    tags: string[];
    category: PersonaCategory;
}

/**
 * Personality stored in local IndexedDB with sync tracking.
 * 
 * ## ID Architecture
 * 
 * **`id`** - Local UUID for internal operations only:
 * - Generated fresh on import (never reuses marketplace ID)
 * - Used for chat-to-persona associations
 * - Allows duplicate imports of same marketplace persona
 * - Stable even if marketplace is unavailable
 * 
 * **`syncedFrom`** - Marketplace persona ID for sync tracking:
 * - Set when persona is imported from marketplace
 * - Used to check for updates against marketplace
 * - Undefined for locally-created personas
 * 
 * This separation ensures local database independence while maintaining
 * the ability to sync with marketplace for updates.
 */
export interface DbPersonality extends Personality {
    /** Local UUID - used for chat associations and internal operations. Never the marketplace ID. */
    id: string;
    /** Marketplace persona ID if imported. Used for sync/update checks. */
    syncedFrom?: string;
    /** Marketplace version at time of import/last update. 0 = locally modified. */
    version?: number;
    /** True if user edited after import (deprecated, use version=0 instead). */
    localModifications?: boolean;
}