const attachButton = document.querySelector<HTMLButtonElement>("#btn-attach");

if (!attachButton) {
    console.error("Attach button not found");
    throw new Error("Attach button is not properly initialized.");
}

attachButton.addEventListener("click", () => {
    const input = document.querySelector<HTMLInputElement>("#attachments");
    if (!input) {
        return
    }
    input.value = ""; // Clear the input value to allow re-selection of the same file
    input.accept = "image/*,application/pdf,text/plain"; // Accept images, PDFs, and text files
    input.multiple = true; // Allow multiple files to be selected
    input.click();
});
