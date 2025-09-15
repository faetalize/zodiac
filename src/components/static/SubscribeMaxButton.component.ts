// Max tier ($29.99) — coming soon. Intentionally no-op.
const button = document.querySelector<HTMLButtonElement>("#btn-subscribe-max");
if (!button) {
    console.error("Subscribe Max button not found");
    throw new Error("Missing DOM element: #btn-subscribe-max");
}

// Ensure it stays disabled and clearly labeled as coming soon
button.disabled = true;
button.title = button.title || "Coming soon";
button.textContent = "Coming Soon";
