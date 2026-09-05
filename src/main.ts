// Decide migration before eager components write defaults or open startup UI.
const { initializeDomainMigration } = await import("./services/DomainMigration.service");
await initializeDomainMigration(async (deferOnboarding) => {
	const { initializeApp } = await import("./app");
	await initializeApp({ deferOnboarding });
});

export {};
