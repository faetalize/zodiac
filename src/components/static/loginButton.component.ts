import * as overlayService from "../../services/Overlay.service";

const loginButton = document.querySelector("#btn-login");

if(!loginButton) {
    console.error("Login button not found");
    throw new Error("Login button not found");
}

loginButton.addEventListener("click", ()=>{
    overlayService.show("login-register-tabs");
})