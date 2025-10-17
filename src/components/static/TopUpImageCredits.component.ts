import * as overlayService from "../../services/Overlay.service";
import { supabase } from "../../services/Supabase.service";
import * as supabaseService from "../../services/Supabase.service";

const topUpButton = document.querySelector<HTMLButtonElement>("#btn-top-up-credits");
const topUp10Button = document.querySelector<HTMLButtonElement>("#btn-top-up-10");
const topUp30Button = document.querySelector<HTMLButtonElement>("#btn-top-up-30");
const topUp70Button = document.querySelector<HTMLButtonElement>("#btn-top-up-70");

//if no logged in user, hide the top up button
const loggedUser = await supabaseService.getCurrentUser();

if (!loggedUser) {
    if (topUpButton) {
        topUpButton.style.display = "none";
    }
}
if (!topUpButton || !topUp10Button || !topUp30Button || !topUp70Button) {
    console.error("One or more Top-Up buttons not found");
    throw new Error("One or more Top-Up buttons not found");
}

topUpButton.addEventListener("click", async () => {
    overlayService.show("form-top-up-imagecredits");
});

topUp10Button.addEventListener("click", async () => {
    try {
        topUp10Button.disabled = true;
        topUp30Button.disabled = true;
        topUp70Button.disabled = true;
        //invoke function with purchase type
        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType: "ten_image_credits" })
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
        topUp10Button.disabled = false;
        topUp30Button.disabled = false;
        topUp70Button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});

topUp30Button.addEventListener("click", async () => {
    try {
        topUp10Button.disabled = true;
        topUp30Button.disabled = true;
        topUp70Button.disabled = true;
        //invoke function with purchase type
        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType: "thirty_image_credits" })
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
        topUp10Button.disabled = false;
        topUp30Button.disabled = false;
        topUp70Button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});

topUp70Button.addEventListener("click", async () => {
    try {
        topUp10Button.disabled = true;
        topUp30Button.disabled = true;
        topUp70Button.disabled = true;
        //invoke function with purchase type
        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType: "seventy_image_credits" })
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
        topUp10Button.disabled = false;
        topUp30Button.disabled = false;
        topUp70Button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});
