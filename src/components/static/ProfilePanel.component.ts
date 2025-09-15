import { User } from "../../models/User";
import * as supabaseService from "../../services/Supabase.service";

const pfpChangeButton = document.querySelector("#btn-change-pfp");
const preferredNameInput = document.querySelector("#profile-preferred-name");
const systemPromptAddition = document.querySelector("#profile-system-prompt");
const saveButton = document.querySelector("#btn-profile-save");
const subscriptionBadge = document.querySelector<HTMLElement>("#subscription-badge");
const manageSubscriptionBtn = document.querySelector<HTMLButtonElement>("#btn-manage-subscription");
const subscriptionCard = document.querySelector<HTMLElement>("#subscription-status-row");
const subscriptionHeader = document.querySelector<HTMLElement>("#subscription-status-row .collapsible-card-header");
const infoCard = document.querySelector<HTMLElement>("#profile-info-card");
const infoHeader = document.querySelector<HTMLElement>("#profile-info-card .collapsible-card-header");
let image: File;

if (!pfpChangeButton || !preferredNameInput || !systemPromptAddition || !saveButton || !subscriptionBadge || !manageSubscriptionBtn || !subscriptionCard || !subscriptionHeader || !infoCard || !infoHeader) {
    console.error("One or more profile panel elements are missing.");
    throw new Error("Profile panel initialization failed.");
}

// Smooth expand/collapse helper
function toggleCard(cardEl: HTMLElement, contentSelector: string) {
    const content = document.querySelector<HTMLElement>(contentSelector);
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

const subHeaderEl = subscriptionHeader as HTMLElement;
subHeaderEl.addEventListener('click', () => toggleCard(subscriptionCard as HTMLElement, '#subscription-card-content'));

const infoHeaderEl = infoHeader as HTMLElement;
infoHeaderEl.addEventListener('click', () => toggleCard(infoCard as HTMLElement, '#profile-info-content'));

// Initialize collapsed states' inline heights to 0 to avoid flash
const subContent = document.querySelector<HTMLElement>('#subscription-card-content');
if ((subscriptionCard as HTMLElement).classList.contains('collapsed') && subContent) {
    subContent.style.height = '0px';
}
const infoContent = document.querySelector<HTMLElement>('#profile-info-content');
if ((infoCard as HTMLElement).classList.contains('collapsed') && infoContent) {
    infoContent.style.height = '0px';
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
        //resize image on client side to 200 x 200 max
        const img = document.createElement("img");
        img.src = URL.createObjectURL(image);
        await img.decode();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error("Failed to get canvas context");
            return;
        }
        const maxSize = 200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
            if (width > maxSize) {
                height = Math.round((height *= maxSize / width));
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = Math.round((width *= maxSize / height));
                height = maxSize;
            }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        const resizedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        const resizedFile = new File([resizedBlob!], "profile_picture.jpeg", { type: 'image/jpeg' });
        let imageURL;
        try {
            imageURL = await supabaseService.uploadPfpToSupabase(resizedFile);
            imageURL = "https://hglcltvwunzynnzduauy.supabase.co/storage/v1/object/public/" + imageURL;
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