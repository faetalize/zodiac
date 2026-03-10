// Max tier button stays enabled for previewing. Intentionally no-op.
const button = document.querySelector<HTMLButtonElement>("#btn-subscribe-max");
if (!button) {
    console.error("Subscribe Max button not found");
    throw new Error("Missing DOM element: #btn-subscribe-max");
}

button.title = button.title || "Coming soon";
