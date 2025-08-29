import * as overlayService from '../../services/Overlay.service';
import * as supabaseService from '../../services/Supabase.service';

const openProfileButton = document.querySelector("#user-profile");
if (!openProfileButton) {
    console.error("Open profile button not found in the document");
    throw new Error("Open profile button not found in the document");
}

openProfileButton.addEventListener("click", async () => {
    overlayService.show("profile");
});