import { getVersion } from "../utils/helpers";
const whatsNewButton = document.querySelector("#btn-whatsnew");

function showWhatsNew() {
    const whatsNewDiv = document.querySelector("#whats-new");
    helpers.showElement(formsOverlay, false);
    helpers.showElement(whatsNewDiv, false);
}


const prevVersion = localStorage.getItem("version");
if (prevVersion != getVersion()) {
    localStorage.setItem("version", getVersion());
    badge.classList.add("badge-highlight");
    setTimeout(() => {
        badge.classList.remove("badge-highlight");
    }, 7000);
}

whatsNewButton.addEventListener("click", showWhatsNew);
