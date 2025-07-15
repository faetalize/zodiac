import { Dexie, EntityTable } from 'dexie';
import { DbChat } from '../models/Chat';
import { DbPersonality } from '../models/Personality';

export interface Db extends Dexie {
    chats: EntityTable<DbChat, 'id'>;
    personalities: EntityTable<DbPersonality, 'id'>;
}

export async function setupDB() {
    let db;
    db = new Dexie("chatDB") as Db;
    db.version(3).stores({
        chats: `
            ++id,
            title,
            timestamp,
            content
        `
    });
    //this is additive, in other words chats table will be kept
    //and the new table will be added
    db.version(4).stores({
        personalities: `
            ++id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `
    });
    db.version(5).stores({
        chats: `
            ++id,
            title,
            timestamp,
            content,
            groundingContent
        `
    });
    return db;
}

export const db = await setupDB();
