// A promise also handles components loaded after the decision has settled.
let release: (() => void) | undefined;
export const startupPresentation = {
	migrationActive: false,
	ready: Promise.resolve()
};

export function holdStartupPresentation(): void {
	startupPresentation.migrationActive = true;
	startupPresentation.ready = new Promise<void>((resolve) => {
		release = resolve;
	});
}

export function releaseStartupPresentation(): void {
	startupPresentation.migrationActive = false;
	release?.();
	release = undefined;
}
