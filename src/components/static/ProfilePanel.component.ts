import { User } from "../../models/User";
import * as supabaseService from "../../services/Supabase.service";

const pfpChangeButton = document.querySelector("#btn-change-pfp");
const preferredNameInput = document.querySelector("#profile-preferred-name");
const systemPromptAddition = document.querySelector("#profile-system-prompt");
const saveButton = document.querySelector("#btn-profile-save");
const subscriptionBadge = document.querySelector<HTMLElement>("#subscription-badge");
const manageSubscriptionBtn = document.querySelector<HTMLButtonElement>("#btn-manage-subscription");
const subscriptionCard = document.querySelector<HTMLElement>("#subscription-status-row");
const subscriptionHeader = document.querySelector<HTMLElement>(".subscription-card-header");
let image: File;

if (!pfpChangeButton || !preferredNameInput || !systemPromptAddition || !saveButton || !subscriptionBadge || !manageSubscriptionBtn || !subscriptionCard || !subscriptionHeader) {
    console.error("One or more profile panel elements are missing.");
    throw new Error("Profile panel initialization failed.");
}

// Expand/collapse subscription card
function toggleSubscriptionCard(){
    const cardEl = subscriptionCard as HTMLElement;
    const content = document.querySelector<HTMLElement>('#subscription-card-content');
    if (!content) {
        cardEl.classList.toggle('collapsed');
        return;
    }

    const isCollapsed = cardEl.classList.contains('collapsed');
    if (isCollapsed) {
        // Expand
        content.style.height = '0px';
        cardEl.classList.remove('collapsed');
        requestAnimationFrame(() => {
            content.style.height = content.scrollHeight + 'px';
        });
        const onEnd = () => {
            content.style.height = 'auto';
            content.removeEventListener('transitionend', onEnd);
        };
        content.addEventListener('transitionend', onEnd);
    } else {
        // Collapse
        const currentHeight = content.scrollHeight;
        content.style.height = currentHeight + 'px';
        void content.offsetHeight; // force reflow
        content.style.height = '0px';
        const onEnd = () => {
            cardEl.classList.add('collapsed');
            content.removeEventListener('transitionend', onEnd);
        };
        content.addEventListener('transitionend', onEnd);
    }
}

const headerEl = subscriptionHeader as HTMLElement;
headerEl.addEventListener('click', toggleSubscriptionCard);

pfpChangeButton.addEventListener("click", async () => {
    const tempInput: HTMLInputElement = document.createElement("input");
    tempInput.type = "file";
    tempInput.accept = "image/*";
    tempInput.multiple = false;

    tempInput.addEventListener("change", async () => {
        const newPfp = tempInput.files?.[0];
        if (newPfp) {
            document.querySelector("#profile-pfp")?.setAttribute("src", URL.createObjectURL(newPfp));
            image = newPfp;
        }
    });

    tempInput.click();
});


saveButton.addEventListener("click", async () => {
    const preferredName = (preferredNameInput as HTMLInputElement).value;
    const systemPrompt = (systemPromptAddition as HTMLTextAreaElement).value;
    if (image) {
        console.log("Uploading new profile picture...");
        let imageURL;
        try {
            imageURL = await supabaseService.uploadPfpToSupabase(image);
            const user: User = {
                preferredName,
                systemPromptAddition: systemPrompt,
                avatar: imageURL
            }
            await supabaseService.updateUser(user);
        } catch (error) {
            console.error("Error uploading image:", error);
            return;
        }
    }
    else {
        const user: User = {
            preferredName,
            systemPromptAddition: systemPrompt,
        }
        await supabaseService.updateUser(user);
    }

});