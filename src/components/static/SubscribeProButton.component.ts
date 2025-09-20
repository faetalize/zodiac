import { supabase } from "../../services/Supabase.service";
import * as overlayService from "../../services/Overlay.service";

// Pro tier ($14.99) subscription button inside the subscription form overlay
const button = document.querySelector<HTMLButtonElement>("#btn-subscribe-pro");
if (!button) {
    console.error("Subscribe Pro button not found");
    throw new Error("Missing DOM element: #btn-subscribe-pro");
}

button.addEventListener("click", async () => {
    try {
        button.disabled = true;
        // Optionally close the overlay to avoid double clicks during redirect
        overlayService.closeOverlay();

        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType: "pro_subscription" })
        });

        if (error) {
            console.error("Stripe checkout creation failed:", error);
            throw new Error(error.message || "Stripe checkout failed");
        }

        const url = data.url;
        if (!url) {
            console.error("Stripe returned no URL", data);
            throw new Error("No checkout URL returned");
        }
        window.location.href = url;
    } catch (e) {
        button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});
