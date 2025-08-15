import * as supabaseService from "../../services/Supabase.service";
import * as overlayService from "../../services/Overlay.service";

const logoutButton = document.querySelector("#btn-profile-logout");

if (!logoutButton) {
    console.error("Logout button not found in the document");
    throw new Error("Logout button not found in the document");
}

logoutButton.addEventListener("click", () => {
    supabaseService.logout();
     overlayService.closeOverlay();
});