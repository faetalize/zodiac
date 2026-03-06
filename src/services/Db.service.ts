import { Dexie } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { DbChat } from '../types/Chat';
import { DbPersonality } from '../types/Personality';
import type { Db } from '../types/Db';

export type { Db };

export async function setupDB() {
    let db: Db;
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
    

    //v10 adds lastModified to chats
    db.version(10).stores({
        chats: `
            ++id,
            title,
            timestamp,
            content,
            lastModified
        `
    });

    //v11 adds independence and nsfw to personalities
    db.version(11).stores({
        personalities: `
            id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            independence,
            nsfw,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `
    });

    // v12: Add marketplace sync fields (tags, category, syncedFrom, version, localModifications)
    db.version(12).stores({
        personalities: `
            id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            independence,
            nsfw,
            internetEnabled,
            roleplayEnabled,
            toneExamples,
            tags,
            category,
            syncedFrom,
            version,
            localModifications
        `
    });

    // v13: Create temp table chats_uuid with string UUID primary key.
    //      Copy all existing chats to it with freshly generated UUIDs.
    db.version(13).stores({
        chats_uuid: `id, title, timestamp, content, lastModified`
    }).upgrade(async (tx) => {
        const oldChats = await tx.table('chats').toArray().catch(() => [] as any[]);
        for (const c of oldChats as any[]) {
            const { id: _old, ...rest } = c;
            await tx.table('chats_uuid').put({ id: uuidv4(), ...rest });
        }
    });

    // v14: Drop old auto-increment chats table.
    db.version(14).stores({
        chats: null
    });

    // v15: Recreate chats with string UUID primary key, copy from chats_uuid.
    db.version(15).stores({
        chats: `id, title, timestamp, content, lastModified`,
        chats_uuid: `id, title, timestamp, content, lastModified`
    }).upgrade(async (tx) => {
        const tmp = await tx.table('chats_uuid').toArray().catch(() => [] as any[]);
        for (const c of tmp as any[]) {
            await tx.table('chats').put(c);
        }
    });

    // v16: Drop temporary chats_uuid table.
    db.version(16).stores({
        chats_uuid: null
    });

    // v17: Add persona timestamp fields for sorting (dateAdded, lastModified).
    db.version(17).stores({
        personalities: `
            id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            independence,
            nsfw,
            internetEnabled,
            roleplayEnabled,
            toneExamples,
            tags,
            category,
            syncedFrom,
            version,
            localModifications,
            dateAdded,
            lastModified
        `
    }).upgrade(async (tx) => {
        const personalities = await tx.table('personalities').toArray().catch(() => [] as any[]);
        const now = Date.now();
        for (const personality of personalities) {
            await tx.table('personalities').put({
                ...personality,
                dateAdded: typeof personality.dateAdded === 'number' ? personality.dateAdded : now,
                lastModified: typeof personality.lastModified === 'number'
                    ? personality.lastModified
                    : (typeof personality.dateAdded === 'number' ? personality.dateAdded : now),
            });
        }
    });

    return db;
}

export const db = await setupDB();

// Debug helper: expose DB on window for quick DevTools inspection during development
try {
    if (typeof window !== 'undefined') {
        (window as any).zodiac_db = db;
        console.log('Db.service: exported zodiac_db for DevTools inspection');
    }
} catch (e) {
    // ignore
}
