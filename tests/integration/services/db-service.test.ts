import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIndexedDb } from "../../helpers/db";

describe("Db.service setup", () => {
	beforeEach(async () => {
		vi.resetModules();
		await resetIndexedDb();
	});

	afterEach(async () => {
		await resetIndexedDb();
	});

	it("creates the expected core tables in fake IndexedDB", async () => {
		const { setupDB } = await import("../../../src/services/Db.service");
		const db = await setupDB();

		expect(db.tables.map((table) => table.name)).toEqual(expect.arrayContaining(["chats", "personalities"]));

		db.close();
	});
});
