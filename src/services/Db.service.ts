import { Dexie, EntityTable } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { DbChat } from '../models/Chat';
import { DbPersonality } from '../models/Personality';

export interface Db extends Dexie {
    chats: EntityTable<DbChat, 'id'>;
    personalities: EntityTable<DbPersonality, 'id'>;
    // Temporary table used during migration to UUID primary keys
    personalities_uuid?: EntityTable<DbPersonality, 'id'>;
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
    // v6: Create a temporary personalities table with string UUID primary key
    // Keep old 'personalities' table to migrate data into the temp table.
    db.version(6).stores({
        personalities_uuid: `
            id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `
    }).upgrade(async (tx) => {
        // Build old->new id map and copy data to personalities_uuid
        const oldPersonalities = await tx.table('personalities').toArray().catch(() => [] as any[]);
        const idMap = new Map<number, string>();
        for (const p of oldPersonalities as any[]) {
            const newId = uuidv4();
            idMap.set(p.id as number, newId);
            // Preserve all fields including non-indexed ones like description
            const { id: _old, ...rest } = p;
            await tx.table('personalities_uuid').put({ id: newId, ...(rest as object) });
        }

        // Remap chats.content[*].personalityid from number -> string UUID
        const chats = await tx.table('chats').toArray();
        for (const chat of chats as any[]) {
            if (Array.isArray(chat.content)) {
                for (const msg of chat.content as any[]) {
                    const pid = (msg?.personalityid ?? undefined) as any;
                    if (typeof pid === 'number' && idMap.has(pid)) {
                        msg.personalityid = idMap.get(pid);
                    }
                }
            }
            await tx.table('chats').put(chat);
        }
    });

    // v7: Drop the old auto-increment personalities table (cannot change primary key in-place)
    db.version(7).stores({
        personalities: null
    });

    // v8: Recreate personalities with string primary key 'id' and copy from personalities_uuid
    db.version(8).stores({
        personalities: `
            id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `,
        personalities_uuid: `
            id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `
    }).upgrade(async (tx) => {
        const tmp = await tx.table('personalities_uuid').toArray().catch(() => [] as any[]);
        for (const p of tmp as any[]) {
            await tx.table('personalities').put(p);
        }
    });

    // v9: Cleanup temporary table
    db.version(9).stores({
        personalities_uuid: null
    });
    return db;
}

export const db = await setupDB();
