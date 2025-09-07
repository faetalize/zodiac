import * as overlayService from "../../services/Overlay.service";
import { getCurrentUser } from "../../services/Supabase.service";

const button = document.querySelector("#btn-show-subscription-options");

if (!button){
    console.error("Show Subscription Options button not found");
    throw new Error("Show Subscription Options button not found");
}

button.addEventListener("click", async () => {
    const user = await getCurrentUser();
    
    if (user) {
        // User is logged in, show subscription options
        overlayService.show("form-subscription");
    } else {
        // User is not logged in, show login overlay
        overlayService.show("login-register-tabs");
    }
});