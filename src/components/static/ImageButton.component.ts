import { isImageGenerationAvailable } from "../../services/Supabase.service";
import { dispatchAppEvent, onAppEvent } from "../../events";

const imageButton = document.querySelector<HTMLButtonElement>("#btn-image");
if (!imageButton) {
	console.error("Image button component initialization failed");
	throw new Error("Missing DOM element: #btn-image");
}

let isImageModeEnabled = false;

function setImageModeEnabled(enabled: boolean): void {
	if (isImageModeEnabled === enabled) {
		return;
	}

	isImageModeEnabled = enabled;
	imageButton!.classList.toggle("btn-toggled", enabled);
	dispatchAppEvent("image-generation-toggled", { enabled });
}

imageButton.addEventListener("click", () => {
	if (imageButton.disabled) return;

	setImageModeEnabled(!isImageModeEnabled);
});

//listen for image-editing-toggled event to disable button if needed
onAppEvent("image-editing-toggled", (event) => {
	if (event.detail.enabled && isImageModeEnabled) {
		setImageModeEnabled(false);
	}
});

onAppEvent("composer-state-reset", () => {
	setImageModeEnabled(false);
});

// Listen for auth and subscription changes
onAppEvent("auth-state-changed", () => {
	updateImageButtonState();
});
onAppEvent("subscription-updated", () => {
	updateImageButtonState();
});

async function updateImageButtonState() {
	if (!imageButton) return;
	try {
		if ((await isImageGenerationAvailable()).enabled) {
			imageButton.style.display = "";
		} else {
			imageButton.style.display = "none";
			setImageModeEnabled(false);
		}
	} catch {
		// If not logged in or error, show by default (probably Free tier)
		imageButton.style.display = "";
	}
}

export function isImageModeActive(): boolean {
	return isImageModeEnabled;
}

// Update state on initialization
updateImageButtonState();
