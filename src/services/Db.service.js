import { Dexie } from 'dexie';
import * as personalityService from './Personality.service';

export function setupDB() {
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
    migratePersonalities(db);
    return db;
}

export const db = setupDB();

function migratePersonalities(db) {
    const personalities = JSON.parse(localStorage.getItem('personalities')) || [];
    if (!personalities) return;
    db.personalities.bulkPut(personalities);
    localStorage.removeItem('personalities');
}

