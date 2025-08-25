const imageButton = document.querySelector<HTMLButtonElement>("#btn-image");
if (!imageButton) {
    console.error("Image button component initialization failed");
    throw new Error("Missing DOM element: #btn-image");
}

let isImageModeEnabled = false;

imageButton.addEventListener("click", () => {
    isImageModeEnabled = !isImageModeEnabled;
    imageButton.classList.toggle("btn-toggled");
});

// Export the state for other components to access
export function isImageModeActive(): boolean {
    return isImageModeEnabled;
}

export function setImageMode(enabled: boolean): void {
    if (!imageButton) return;
    
    isImageModeEnabled = enabled;
    if (enabled) {
        imageButton.classList.add("btn-toggled");
    } else {
        imageButton.classList.remove("btn-toggled");
    }
}
