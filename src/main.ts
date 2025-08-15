
import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';



//load all component code
const components = import.meta.glob('./components/static/*.ts');
for (const path in components) {
    components[path]();
}

// Initialize in the correct order
settingsService.initialize();

// Initialize database
await chatsService.initialize();
await personalityService.initialize();

//event listeners
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
hideOverlayButton?.addEventListener("click", () => overlayService.closeOverlay());


overlayService.show("form-subscription")