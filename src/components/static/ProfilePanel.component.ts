import { User } from "../../models/User";
import * as supabaseService from "../../services/Supabase.service";

const pfpChangeButton = document.querySelector("#btn-change-pfp");
const preferredNameInput = document.querySelector("#profile-preferred-name");
const systemPromptAddition = document.querySelector("#profile-system-prompt");
const saveButton = document.querySelector("#btn-profile-save");
const subscriptionBadge = document.querySelector<HTMLElement>("#subscription-badge");
const manageSubscriptionBtn = document.querySelector<HTMLAnchorElement>("#btn-manage-subscription");
let image: File;

if (!pfpChangeButton || !preferredNameInput || !systemPromptAddition || !saveButton || !subscriptionBadge || !manageSubscriptionBtn) {
    console.error("One or more profile panel elements are missing.");
    throw new Error("Profile panel initialization failed.");
}

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