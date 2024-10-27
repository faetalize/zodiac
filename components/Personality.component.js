import { showEditPersonalityForm } from "../services/Overlay.service";
import { sharePersonality, deleteLocalPersonality, getPersonalityCard } from "../services/Personality.service";
import * as helpers from "../utils/helpers.util";

export function createPersonalityCard(JSON) {
    const personalityCard = document.createElement("label");
    personalityCard.classList.add("card-personality");
    personalityCard.style.backgroundImage = `url('${JSON.image}')`;
    personalityCard.innerHTML = `
            <input type="radio" name="personality" value="${JSON.name}">
            <div>
                <h3 class="personality-title">${JSON.name}</h3>
                <p class="personality-description">${JSON.description}</p>
                <p class="personality-prompt">${JSON.prompt}</p>
            </div>
            <button class="btn-textual btn-edit-card material-symbols-outlined" 
                id="btn-edit-personality-${JSON.name}">edit</button>
            <button class="btn-textual btn-share-card material-symbols-outlined" 
                id="btn-share-personality-${JSON.name}">share</button>
            <button class="btn-textual btn-delete-card material-symbols-outlined"
                id="btn-delete-personality-${JSON.name}">delete</button>
            `;

    // Add event listeners
    const shareButton = personalityCard.querySelector(".btn-share-card");
    const deleteButton = personalityCard.querySelector(".btn-delete-card");
    const editButton = personalityCard.querySelector(".btn-edit-card");
    const input = personalityCard.querySelector("input");
    if (shareButton) {
        shareButton.addEventListener("click", () => {
            sharePersonality(personalityCard);
        });
    }
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            //first if the personality to delete is the one currently selected, we select the default personality
            if (input.checked) {
                getPersonalityCard(0).click();
            }
            //we can't call indexOf on a HTMLCollection, so we convert it to an array first
            const index = Array.from(personalityCard.parentNode.children).indexOf(personalityCard);
            deleteLocalPersonality(index);
            personalityCard.remove();
        });
    }
    editButton.addEventListener("click", () => {
        const personalityToEditIndex = Array.from(personalityCard.parentNode.children).indexOf(personalityCard);
        if(personalityToEditIndex<=0){return}
        showEditPersonalityForm(personalityToEditIndex);
    });
    input.addEventListener("change", () => {
        const personalityCards = document.getElementsByClassName("card-personality");
        console.log("input checked")
        if (input.checked) {
            // Darken all cards
            [...personalityCards].forEach(card => {
                card.style.outline = "0px solid rgb(150 203 236)";
                helpers.darkenCard(card);
            })
            // Lighten selected card
            input.parentElement.style.outline = "3px solid rgb(150 203 236)";
            helpers.lightenCard(input.parentElement);
        }

    });
    // Set initial outline
    if (input.checked) {
        helpers.lightenCard(input.parentElement);
        input.parentElement.style.outline = "3px solid rgb(150 203 236)";
    }
    return personalityCard;
}