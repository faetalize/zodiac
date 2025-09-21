import * as overlayService from "../../services/Overlay.service";
import { supabase } from "../../services/Supabase.service";

const topUpButton = document.querySelector<HTMLButtonElement>("#btn-top-up-credits");
const topUp10Button = document.querySelector<HTMLButtonElement>("#btn-top-up-10");
const topUp75Button = document.querySelector<HTMLButtonElement>("#btn-top-up-75");
const topUp300Button = document.querySelector<HTMLButtonElement>("#btn-top-up-300");

if (!topUpButton || !topUp10Button || !topUp75Button || !topUp300Button) {
    console.error("One or more Top-Up buttons not found");
    throw new Error("One or more Top-Up buttons not found");
}

topUpButton.addEventListener("click", async () => {
    overlayService.show("form-top-up-imagecredits");
});

topUp10Button.addEventListener("click", async () => {
    try {
        topUp10Button.disabled = true;
        topUp75Button.disabled = true;
        topUp300Button.disabled = true;
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
        topUp75Button.disabled = false;
        topUp300Button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});

topUp75Button.addEventListener("click", async () => {
    try {
        topUp10Button.disabled = true;
        topUp75Button.disabled = true;
        topUp300Button.disabled = true;
        //invoke function with purchase type
        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType: "seventy_five_image_credits" })
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
        topUp75Button.disabled = false;
        topUp300Button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});

topUp300Button.addEventListener("click", async () => {
    try {
        topUp10Button.disabled = true;
        topUp75Button.disabled = true;
        topUp300Button.disabled = true;
        //invoke function with purchase type
        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType: "three_hundred_image_credits" })
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
        topUp75Button.disabled = false;
        topUp300Button.disabled = false;
        console.error(e);
        alert("Unable to start checkout. Please try again in a moment.");
    }
});
