import { Dexie } from 'dexie';
import * as personalityService from './Personality.service';
import * as chatService from './Chats.service';

export async function setupDB() {
    let db;
    try {
        db = new Dexie("chatDB");
    } catch (error) {
        console.error(error);
        alert("failed to setup dexie (database)");
        return;
    }
    db.version(3).stores({
        chats: `
            ++id,
            title,
            timestamp,
            content
        `
    });

    //add a personalities table
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
    await migrateChats(db);
    return db;
}

export const db = await setupDB();

async function migrateChats(db) {
    const chats = await chatService.getAllChats(db);
    if (!chats) return;

    const migratedChats = await Promise.all([...chats].map(async chat => {
        for (const message of chat.content) {
            if (message.personality) {
                const personality = await personalityService.getByName(message.personality, db);
                message.personalityid = personality.id;
            }
            else{
                delete message.personalityid;
            }

        }
        return chat;
    }))

    await db.chats.bulkPut(migratedChats);
}