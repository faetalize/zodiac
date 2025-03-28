import * as messageService from '../services/Message.service';
import * as dbService from '../services/Db.service';
import * as helpers from '../utils/helpers';

const messageInput = document.querySelector("#messageInput");
const sendMessageButton = document.querySelector("#btn-send");

//enter key to send message but support shift+enter for new line
messageInput.addEventListener("keydown", (e) => {
    // Check if the user is on a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        sendMessageButton.click();
    }
});
messageInput.addEventListener("blur", () => {
});
messageInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
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
        await messageService.send(message, dbService.db);

    } catch (error) {
        if(error.status === 429){
            alert("Error, you have reached the API's rate limit. Please try again later or use the Flash model.");
            return;
        }
        console.error(error);
        alert(error)
    }
});