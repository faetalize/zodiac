import * as messageService from '../../services/Message.service';
import * as helpers from '../../utils/helpers';
import * as personalityService from '../../services/Personality.service';

const messageInput = document.querySelector<HTMLInputElement>("#messageInput");
const sendMessageButton = document.querySelector<HTMLButtonElement>("#btn-send");
const internetSearchToggle = document.querySelector<HTMLButtonElement>("#btn-internet");
const roleplayActionsMenu = document.querySelector<HTMLButtonElement>("#btn-roleplay");
if (!messageInput || !sendMessageButton || !internetSearchToggle || !roleplayActionsMenu) {
    console.error("Chat input component is missing some elements. Please check the HTML structure.");
    throw new Error("Chat input component is not properly initialized.");
}

let isInternetSearchEnabled = false;

internetSearchToggle.addEventListener("click", () => {
    isInternetSearchEnabled = !isInternetSearchEnabled;
    internetSearchToggle.classList.toggle("btn-toggled");
});

//enter key to send message but support shift+enter for new line
messageInput.addEventListener("keydown", (e: KeyboardEvent) => {
    // Check if the user is on a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        sendMessageButton.click();
    }
});
messageInput.addEventListener("blur", () => {
});
messageInput.addEventListener("paste", (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData!.getData('text/plain');
    document.execCommand("insertText", false, text);
});
messageInput.addEventListener("input", () => {
    if (messageInput.innerHTML == "<br>") {
        messageInput.innerHTML = "";
    }
});
sendMessageButton.addEventListener("click", async () => {
    try {
        const message = helpers.getEncoded(messageInput.innerHTML);
        messageInput.innerHTML = "";
        await messageService.send(message);

    } catch (error: any) {
        console.error("error", JSON.stringify(error));
        if (error.status === 429 || error.code === 429) {
            alert("Error, you have reached the API's rate limit. Please try again later or use the Flash model.");
        }
        else {
            alert(error);
        }
    }
});


const setupBottomBar = async () => {
    const personality = await personalityService.getSelected();
        if (personality) {
            messageInput.setAttribute("placeholder", `Send a message to ${personality.name}`);
            if (personality.roleplayEnabled){
                roleplayActionsMenu.style.display = "block";
            }
            else {
                roleplayActionsMenu.style.display = "none";
            }
            if (personality.internetEnabled) {
                internetSearchToggle.style.display = "block";
            }
            else {
                internetSearchToggle.style.display = "none";
            }
        }
        else {
            messageInput.setAttribute("placeholder", "Send a message");
        }
    
}


document.querySelector<HTMLDivElement>("#personalitiesDiv")!.addEventListener("change", async (e: Event) => {
    if ((e.target as HTMLSelectElement).name === "personality") {
        await setupBottomBar();
    }
});

await setupBottomBar();