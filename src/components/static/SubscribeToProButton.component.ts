import * as overlayService from "../../services/Overlay.service";

const button = document.querySelector("#btn-subscribe-to-pro");

if (!button){
    console.error("Subscribe to Pro button not found");
    throw new Error("Subscribe to Pro button not found");
}

button.addEventListener("click", () => {
    overlayService.show("form-subscription");
});