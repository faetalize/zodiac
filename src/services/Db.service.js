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
    await migratePersonalities(db);
    await migrateChats(db);
    return db;
}

export const db = await setupDB();

async function migratePersonalities(db) {
    const personalities = JSON.parse(localStorage.getItem('personalities')) || [];
    if (!personalities) return;
    await db.personalities.bulkPut(personalities);
    localStorage.removeItem('personalities');
}

async function migrateChats(db) {
    const chats = await chatService.getAllChats(db);
    if (!chats) return;
    //convert chats.message.txt to chats.message.parts[0].text
    await db.chats.bulkPut([...chats].map(chat => {
        for (const message of chat.content) {
            if (!message.parts) {
                message.parts = [{ text: message.txt }]
            }
            delete message.txt;
        }
        return chat;
    }));
}