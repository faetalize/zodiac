import * as overlayService from "../../services/Overlay.service";
import { getCurrentUser } from "../../services/Supabase.service";

const button = document.querySelector("#btn-show-subscription-options");
const closeButton = document.querySelector("#btn-close-subscription");

if (!button || !closeButton) {
	throw new Error("Missing subscription options controls");
}

closeButton.addEventListener("click", () => overlayService.closeOverlay());

button.addEventListener(
	"click",
	() =>
		void (async () => {
			const user = await getCurrentUser();

			if (user) {
				// User is logged in, show subscription options
				overlayService.show("form-subscription");
			} else {
				// User is not logged in, show login overlay
				overlayService.show("login-register-tabs");
			}
		})()
);
