import { supabase, getCurrentUser, getSubscriptionTier, getUserSubscription, openCustomerPortal } from "../../services/Supabase.service";
import * as overlayService from "../../services/Overlay.service";
import * as toastService from "../../services/Toast.service";
import { confirmDialog } from "../../utils/helpers";

type PlanType = "pro" | "pro_plus" | "max";
type BillingMode = "monthly" | "yearly";
type PurchaseType =
    | "pro_monthly"
    | "pro_yearly"
    | "pro_plus_monthly"
    | "pro_plus_yearly"
    | "max_monthly"
    | "max_yearly";

const subscriptionForm = document.querySelector<HTMLElement>("#form-subscription");
const proButton = document.querySelector<HTMLButtonElement>("#btn-subscribe-pro");
const proPlusButton = document.querySelector<HTMLButtonElement>("#btn-subscribe-pro-plus");
const maxButton = document.querySelector<HTMLButtonElement>("#btn-subscribe-max");

if (!subscriptionForm || !proButton || !proPlusButton || !maxButton) {
    console.error("One or more subscription CTA buttons are missing");
    throw new Error("Missing subscription pricing CTA elements");
}

const ensuredSubscriptionForm = subscriptionForm;

const subscriptionButtons: Array<{ plan: PlanType; button: HTMLButtonElement; defaultText: string }> = [
    { plan: "pro", button: proButton, defaultText: proButton.textContent?.trim() || "Start Pro" },
    { plan: "pro_plus", button: proPlusButton, defaultText: proPlusButton.textContent?.trim() || "Start Pro Plus" },
    { plan: "max", button: maxButton, defaultText: maxButton.textContent?.trim() || "Start Max" },
];

function getBillingMode(): BillingMode {
    return ensuredSubscriptionForm.dataset.billing === "yearly" ? "yearly" : "monthly";
}

function getPurchaseType(plan: PlanType, billingMode: BillingMode): PurchaseType {
    if (plan === "pro") {
        return billingMode === "yearly" ? "pro_yearly" : "pro_monthly";
    }

    if (plan === "pro_plus") {
        return billingMode === "yearly" ? "pro_plus_yearly" : "pro_plus_monthly";
    }

    return billingMode === "yearly" ? "max_yearly" : "max_monthly";
}

function setButtonsLoadingState(isLoading: boolean, activeButton?: HTMLButtonElement): void {
    subscriptionButtons.forEach(({ button, defaultText }) => {
        button.disabled = isLoading;
        button.textContent = isLoading && button === activeButton ? "Redirecting..." : defaultText;
    });
}

async function startCheckout(plan: PlanType, button: HTMLButtonElement): Promise<void> {
    const user = await getCurrentUser();
    if (!user) {
        overlayService.show("login-register-tabs");
        return;
    }

    const currentSubscription = await getUserSubscription();
    const currentTier = getSubscriptionTier(currentSubscription);
    const hasPaidSubscription = currentTier === "pro" || currentTier === "pro_plus" || currentTier === "max";

    if (hasPaidSubscription) {
        const shouldOpenPortal = await confirmDialog(
            "You already have an active subscription. We can take you to your customer portal, where you can change your plan, billing interval, and cancellation settings.",
            {
                okText: "Open Customer Portal",
                cancelText: "Cancel",
            }
        );
        if (!shouldOpenPortal) {
            return;
        }

        try {
            await openCustomerPortal();
            overlayService.closeOverlay();
        } catch (error) {
            console.error(error);
            toastService.danger({
                title: "Portal Unavailable",
                text: "Unable to open your customer portal right now. Please try again in a moment.",
            });
        }

        return;
    }

    const purchaseType = getPurchaseType(plan, getBillingMode());

    try {
        setButtonsLoadingState(true, button);

        const { data, error } = await supabase.functions.invoke("stripe", {
            method: "POST",
            body: JSON.stringify({ purchaseType }),
        });

        if (error) {
            console.error("Stripe checkout creation failed:", error);
            throw new Error(error.message || "Stripe checkout failed");
        }

        const url = data?.url;
        if (!url) {
            console.error("Stripe returned no URL", data);
            throw new Error("No checkout URL returned");
        }

        overlayService.closeOverlay();
        window.location.href = url;
    } catch (error) {
        console.error(error);
        setButtonsLoadingState(false);
        toastService.danger({
            title: "Checkout Failed",
            text: "Unable to start checkout. Please try again in a moment.",
        });
    }
}

subscriptionButtons.forEach(({ plan, button }) => {
    button.addEventListener("click", async () => {
        await startCheckout(plan, button);
    });
});
