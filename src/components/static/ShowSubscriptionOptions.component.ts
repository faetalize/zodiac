import * as overlayService from "../../services/Overlay.service";

const button = document.querySelector("#btn-show-subscription-options");

if (!button){
    console.error("Show Subscription Options button not found");
    throw new Error("Show Subscription Options button not found");
}

button.addEventListener("click", () => {
    overlayService.show("form-subscription");
});