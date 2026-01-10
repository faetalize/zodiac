import * as loraService from "../../services/Lora.service";
import { LoRAInfo, LoRAState } from "../../types/Lora";

const buildTriggers = (words: string[] | undefined): HTMLDivElement => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("lora-card-triggers");

    const sanitized = Array.from(
        new Set(
            (words ?? [])
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
        )
    );

    if (sanitized.length === 0) {
        const empty = document.createElement("p");
        empty.classList.add("lora-card-empty");
        empty.textContent = "No trigger words provided.";
        wrapper.appendChild(empty);
        return wrapper;
    }

    sanitized.forEach((word) => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("lora-card-trigger");
        button.textContent = word;
        button.setAttribute("title", `Copy "${word}" to clipboard`);
        button.setAttribute("aria-label", `Copy trigger word "${word}" to clipboard`);

        button.addEventListener("click", async () => {
            const clipboard = navigator.clipboard;
            if (!clipboard || !clipboard.writeText) {
                console.warn("[LoRA] Clipboard API unavailable in this browser.");
                return;
            }
            try {
                await clipboard.writeText(word);
                button.dataset.copied = "true";
                button.setAttribute("aria-label", `Copied "${word}" to clipboard`);
            } catch (error) {
                console.error("[LoRA] Failed to copy trigger word:", word, error);
            } finally {
                window.setTimeout(() => {
                    button.removeAttribute("data-copied");
                    button.setAttribute("aria-label", `Copy trigger word "${word}" to clipboard`);
                }, 500);
            }
        });

        wrapper.appendChild(button);
    });

    return wrapper;
};

export const loraElement = (lora: LoRAInfo, initialState: Omit<LoRAState, "lora">): HTMLDivElement => {
    const container = document.createElement("div");
    container.classList.add("card", "card-lora");
    container.dataset.modelVersionId = lora.modelVersionId;

    const safeName = lora.name.trim() || "Untitled LoRA";

    const header = document.createElement("div");
    header.classList.add("lora-card-header");

    const headerMain = document.createElement("div");
    headerMain.classList.add("lora-card-header-main");

    const title = document.createElement("h4");
    title.classList.add("lora-card-title");
    title.textContent = safeName;
    title.setAttribute("title", safeName);
    headerMain.appendChild(title);

    const badge = document.createElement("span");
    badge.classList.add("badge", "lora-card-base");
    badge.textContent = lora.baseModel;
    badge.setAttribute("title", `Base model: ${lora.baseModel}`);
    headerMain.appendChild(badge);

    header.appendChild(headerMain);

    container.appendChild(header);

    const meta = document.createElement("div");
    meta.classList.add("lora-card-meta");
    meta.setAttribute("title", `Model version ID ${lora.modelVersionId}`);

    const metaIcon = document.createElement("span");
    metaIcon.classList.add("material-symbols-outlined");
    metaIcon.setAttribute("aria-hidden", "true");
    metaIcon.textContent = "fingerprint";

    const metaValue = document.createElement("span");
    metaValue.classList.add("lora-card-version");
    metaValue.textContent = lora.modelVersionId;

    const loraUrl = lora.url.trim();

    if (loraUrl.length > 0) {
        const metaLink = document.createElement("a");
        metaLink.href = loraUrl;
        metaLink.target = "_blank";
        metaLink.rel = "noopener noreferrer";
        metaLink.classList.add("lora-card-meta-link");
        metaLink.setAttribute("aria-label", `Open ${safeName} model version in a new tab`);

        metaLink.appendChild(metaIcon);
        metaLink.appendChild(metaValue);
        meta.appendChild(metaLink);
    } else {
        meta.appendChild(metaIcon);
        meta.appendChild(metaValue);
    }

    container.appendChild(meta);

    const strength = document.createElement("div");
    strength.classList.add("lora-strength");

    const strengthLabel = document.createElement("label");
    strengthLabel.classList.add("lora-strength-label");
    const strengthInputId = `lora-strength-${lora.modelVersionId}`;
    strengthLabel.setAttribute("for", strengthInputId);
    strengthLabel.textContent = "Strength";
    strength.appendChild(strengthLabel);

    const strengthSlider = document.createElement("input");
    strengthSlider.type = "range";
    strengthSlider.classList.add("lora-strength-slider");
    strengthSlider.id = strengthInputId;
    strengthSlider.name = `lora-strength-${lora.modelVersionId}`;
    strengthSlider.min = "-2";
    strengthSlider.max = "2";
    strengthSlider.step = "0.1";
    strengthSlider.value = initialState.strength?.toString() ?? "1";
    strengthSlider.setAttribute("aria-label", `${safeName} strength`);

    const strengthControl = document.createElement("div");
    strengthControl.classList.add("lora-strength-control");
    strengthControl.appendChild(strengthSlider);

    const strengthValue = document.createElement("span");
    strengthValue.classList.add("lora-strength-value");
    strengthControl.appendChild(strengthValue);

    strength.appendChild(strengthControl);

    container.appendChild(strength);

    const controls = document.createElement("div");
    controls.classList.add("lora-card-controls");

    const toggle = document.createElement("label");
    toggle.classList.add("lora-card-toggle");
    toggle.setAttribute("title", "Toggle this LoRA on or off");

    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.classList.add("uxtoggle");
    toggleInput.checked = initialState.enabled ?? false;
    toggleInput.name = `lora-enabled-${lora.modelVersionId}`;
    toggleInput.setAttribute("aria-label", `Toggle ${safeName}`);
    toggle.appendChild(toggleInput);

    controls.appendChild(toggle);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.classList.add("lora-card-delete");
    deleteButton.setAttribute("aria-label", `Remove ${safeName}`);
    deleteButton.setAttribute("title", "Remove this LoRA");

    const deleteIcon = document.createElement("span");
    deleteIcon.classList.add("material-symbols-outlined");
    deleteIcon.setAttribute("aria-hidden", "true");
    deleteIcon.textContent = "delete";
    deleteButton.appendChild(deleteIcon);

    controls.appendChild(deleteButton);

    container.appendChild(controls);

    const section = document.createElement("div");
    section.classList.add("lora-card-section");

    const sectionTitle = document.createElement("span");
    sectionTitle.classList.add("lora-card-section-title");
    sectionTitle.textContent = "Trigger words";
    section.appendChild(sectionTitle);

    section.appendChild(buildTriggers(lora.trainedWords));

    container.appendChild(section);

    deleteButton.addEventListener("click", () => {
        loraService.deleteLora(lora.modelVersionId);
        container.remove();
    });

    toggleInput.addEventListener("change", () => {
        loraService.toggleLora(lora.modelVersionId, toggleInput.checked);
        console.log(loraService.getLoraState());
    });

    const syncStrengthValue = (rawValue: string) => {
        const numericValue = parseFloat(rawValue);
        strengthValue.textContent = Number.isFinite(numericValue) ? numericValue.toFixed(1) : rawValue;
    };

    syncStrengthValue(strengthSlider.value);

    strengthSlider.addEventListener("input", () => {
        syncStrengthValue(strengthSlider.value);
        loraService.setLoraStrength(lora.modelVersionId, parseFloat(strengthSlider.value));
    });

    return container;
};