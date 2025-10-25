
import { themeService } from './services/Theme.service';
import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import * as onboardingService from './services/Onboarding.service';

//load all component code
const components = import.meta.glob('./components/static/*.ts');
for (const path in components) {
    components[path]();
}

// Initialize theme service first (before DOM is fully rendered)
themeService.initialize();

// Initialize in the correct order
settingsService.initialize();

// Initialize database
await chatsService.initialize();
await personalityService.initialize();

//event listeners
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
hideOverlayButton?.addEventListener("click", () => overlayService.closeOverlay());

// Check if onboarding should show on first run
if (await onboardingService.shouldShowOnboarding()) {
    onboardingService.show();
}