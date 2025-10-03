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

//enter key to send message but support shift+enter for new line on PC only
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
messageInput.addEventListener("input", (e) => {
    if (messageInput.innerHTML.trim() == "<br>" || messageInput.innerHTML.trim() == "<p><br></p>") {
        messageInput.innerHTML = "";
    }
});

sendMessageButton.addEventListener("click", async () => {
    let userMessageElement: HTMLElement | undefined;
    try {
        const message = helpers.getEncoded(messageInput.innerHTML);
        messageInput.innerHTML = "";
        userMessageElement = await messageService.send(message);
    } catch (error: any) {
        if (userMessageElement) {
            (userMessageElement as HTMLElement).classList.add("message-failure");
        }
        alert("Error, please report this to the developer. You might need to restart the page to continue normal usage: " + error);
        console.error(error);
        return;
    }
});


const setupBottomBar = async () => {
    const personality = await personalityService.getSelected();
    if (personality) {
        messageInput.setAttribute("placeholder", `Send a message to ${personality.name}`);
        if (personality.roleplayEnabled) {
            roleplayActionsMenu.classList.remove("hidden");
        }
        else {
            roleplayActionsMenu.classList.add("hidden");
        }
        if (personality.internetEnabled) {
            internetSearchToggle.classList.remove("hidden");
        }
        else {
            internetSearchToggle.classList.add("hidden");
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