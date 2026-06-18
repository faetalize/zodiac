import { SUPPORTED_ACCEPT_ATTRIBUTE } from "../../utils/attachments";

const attachButton = document.querySelector<HTMLButtonElement>("#btn-attach");

if (!attachButton) {
	console.error("Attach button not found");
	throw new Error("Attach button is not properly initialized.");
}

attachButton.addEventListener("click", () => {
	const input = document.querySelector<HTMLInputElement>("#attachments");
	if (!input) {
		return;
	}
	input.value = ""; // Clear the input value to allow re-selection of the same file
	input.accept = SUPPORTED_ACCEPT_ATTRIBUTE;
	input.multiple = true; // Allow multiple files to be selected
	input.click();
});
