import type { Dexie, EntityTable } from "dexie";
import type { DbChat } from "./Chat";
import type { DbPersonality } from "./Personality";

export interface Db extends Dexie {
	chats: EntityTable<DbChat, "id">;
	personalities: EntityTable<DbPersonality, "id">;
	personalities_uuid?: EntityTable<DbPersonality, "id">;
}
