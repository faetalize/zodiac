const subscriptionFormElement = document.querySelector<HTMLElement>("#form-subscription");

if (!subscriptionFormElement) {
	console.error("Subscription form not found");
	throw new Error("Missing DOM element: #form-subscription");
}

const subscriptionForm = subscriptionFormElement;

const billingButtons = Array.from(subscriptionForm.querySelectorAll<HTMLButtonElement>("[data-billing-option]"));

if (billingButtons.length === 0) {
	console.error("Subscription billing buttons not found");
	throw new Error("Missing billing toggle buttons in subscription form");
}

function setBillingMode(mode: string): void {
	subscriptionForm.dataset.billing = mode;

	billingButtons.forEach((button) => {
		const isActive = button.dataset.billingOption === mode;
		button.classList.toggle("subscription-billing-option-active", isActive);
		button.setAttribute("aria-pressed", String(isActive));
	});
}

billingButtons.forEach((button) => {
	button.addEventListener("click", () => {
		const mode = button.dataset.billingOption;
		if (!mode) return;
		setBillingMode(mode);
	});
});

setBillingMode(subscriptionForm.dataset.billing ?? "monthly");
