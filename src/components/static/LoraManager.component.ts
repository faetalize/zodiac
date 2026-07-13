import type { LoRAInfo, LoRAState } from "../../types/Lora";
import * as loraService from "../../services/Lora.service";
import { supportedLoraBaseModelLabels } from "../../constants/Loras";
import { info, danger, warn } from "../../services/Toast.service";
import { onAppEvent } from "../../events";
import { loraElement } from "../dynamic/lora";

const input = document.querySelector<HTMLInputElement>("#lora-url-input");
const addBtn = document.querySelector<HTMLButtonElement>("#btn-add-lora");
const container = document.querySelector<HTMLDivElement>("#lora-settings");
const loraContainerList = document.querySelector<HTMLDivElement>("#lora-list");
let hasShownDuplicateCleanupToast = false;

if (!input || !addBtn || !container || !loraContainerList) {
	console.error("One or more LoRA manager elements are missing.");
	throw new Error("LoRA manager initialization failed.");
}

addBtn?.addEventListener("click", () => {
	void addLoraFromInput();
});

input?.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		void addLoraFromInput();
	}
});

onAppEvent("lora-list-refreshed", (event) => {
	renderLoras();
	if (event.detail.removedDuplicateCount > 0 && !hasShownDuplicateCleanupToast) {
		hasShownDuplicateCleanupToast = true;
		const count = event.detail.removedDuplicateCount;
		info({
			title: "Duplicate LoRAs cleaned up",
			text: `Cleaned up ${count} duplicate LoRA${count === 1 ? "" : "s"}.`
		});
	}
});

void initializeLoras();

async function initializeLoras() {
	await loraService.initialize();
}

function renderLoras() {
	if (!loraContainerList) return;
	const statesByModelVersionId = new Map(
		loraService.getLoraState().map((state) => [state.lora.modelVersionId, state])
	);
	loraContainerList.replaceChildren(
		...loraService
			.getAll()
			.map((lora) =>
				loraElement(lora, statesByModelVersionId.get(lora.modelVersionId) ?? loraService.initialLoraState)
			)
	);
}

function isLikelyCivitUrl(url: string): boolean {
	try {
		const u = new URL(url);
		return /civitai\.com$/i.test(u.hostname) || u.hostname.toLowerCase().includes("civitai");
	} catch {
		return false;
	}
}

async function addLoraFromInput() {
	const value = input?.value || "";
	if (!value) return;
	if (!isLikelyCivitUrl(value)) {
		console.warn("[LoRA] Provided URL does not look like a CivitAI link:", value);
		warn({
			title: "Unrecognized LoRA URL",
			text: "Only CivitAI URLs are supported."
		});
		return;
	}
	const result = await loraService.add(value);
	switch (result.status) {
		case "added":
			appendLora(result.lora, loraService.initialLoraState);
			info({
				title: "LoRA added",
				text: `Added \"${result.lora.name}\" to your LoRAs.`
			});
			break;
		case "duplicate":
			warn({
				title: "LoRA already added",
				text: "This LoRA is already in your list."
			});
			break;
		case "unsupported":
			warn({
				title: "Unsupported LoRA",
				text: `This LoRA is trained for "${result.baseModel}", which no available image model supports. Supported base models: ${supportedLoraBaseModelLabels().join(", ")}.`
			});
			break;
		case "failed":
			danger({
				title: "Failed to add LoRA",
				text: "Could not retrieve LoRA metadata. Please check the URL and try again."
			});
			break;
	}

	// Clear input after save
	if (input) input.value = "";
}

function appendLora(lora: LoRAInfo, initialState: Omit<LoRAState, "lora">) {
	const element = loraElement(lora, initialState);
	loraContainerList?.appendChild(element);
}
