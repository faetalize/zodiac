import Dexie from "dexie";

export async function resetIndexedDb(name = "chatDB"): Promise<void> {
    await Dexie.delete(name);
}

export async function openFreshTestDb() {
    await resetIndexedDb();
    const { setupDB } = await import("../../src/services/Db.service");
    return setupDB();
}
