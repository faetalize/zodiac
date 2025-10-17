import { LoRAInfo, LoRAState } from "../../models/Lora";
import * as loraService from "../../services/Lora.service";
import { danger, warn } from "../../services/Toast.service";
import { loraElement } from "../dynamic/lora";

const input = document.querySelector<HTMLInputElement>('#lora-url-input');
const addBtn = document.querySelector<HTMLButtonElement>('#btn-add-lora');
const container = document.querySelector<HTMLDivElement>('#lora-settings');
const loraContainerList = document.querySelector<HTMLDivElement>('#lora-list');

if (!input || !addBtn || !container || !loraContainerList) {
  console.error("One or more LoRA manager elements are missing.");
  throw new Error("LoRA manager initialization failed.");
}

addBtn?.addEventListener('click', () => {
  addLoraFromInput();
});

input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addLoraFromInput();
  }
});

//populate LoRAs
initializeLoras();

async function initializeLoras() {
  await loraService.initialize();
  loraService.getAll().forEach((lora) => {
    appendLora(lora, loraService.initialLoraState);
  });
}

function isLikelyCivitUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /civitai\.com$/i.test(u.hostname) || u.hostname.toLowerCase().includes('civitai');
  } catch {
    return false;
  }
}

async function addLoraFromInput() {
  const value = input?.value || '';
  if (!value) return;
  if (!isLikelyCivitUrl(value)) {
    console.warn('[LoRA] Provided URL does not look like a CivitAI link:', value);
    warn({
      title: "Unrecognized LoRA URL",
      text: "Only CivitAI URLs are supported.",
    })
    return;
  }
  const lora = await loraService.add(value);
  if (lora) {
    appendLora(lora, loraService.initialLoraState);
  }
  else{
    danger({
      title: "Failed to add LoRA",
      text: "Could not retrieve LoRA metadata. Please check the URL and try again.",
    })
  }

  // Clear input after save
  if (input) input.value = '';
}

function appendLora(lora: LoRAInfo, initialState: Omit<LoRAState, "lora">) {
  const element = loraElement(lora, initialState);
  loraContainerList?.appendChild(element);
}