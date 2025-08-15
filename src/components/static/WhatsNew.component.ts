import * as overlayService from "../../services/Overlay.service";
import { getVersion } from "../../utils/helpers";

const whatsNewButton = document.querySelector("#btn-whatsnew")!;

//setup version number on badge and header
whatsNewButton.querySelector("#badge-version")!.textContent = `${getVersion()}`;
document.querySelector('#header-version')!.textContent += `${getVersion()}`;

whatsNewButton.addEventListener("click", () => {
    overlayService.showChangelog();
    whatsNewButton.classList.remove("badge-highlight");
});
//if version changes, highlight the changelog btn
const prevVersion = localStorage.getItem("version");
if (prevVersion != getVersion()) {
    localStorage.setItem("version", getVersion());
    whatsNewButton.classList.add("badge-highlight");
    setTimeout(() => {
        whatsNewButton.classList.remove("badge-highlight");
    }, 7000);
}



