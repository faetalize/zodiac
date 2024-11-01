import { showEditPersonalityForm } from "../services/Overlay.service";
import { sharePersonality, deletePersonality, getPersonalityCard, getPersonalityIndex } from "../services/Personality.service";

export class Personality {
    constructor(name = "", image = "", description = "", prompt = "", aggressiveness = 0, sensuality = 0 , internetEnabled = false, toneExamples = []) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.aggressiveness = aggressiveness;
        this.sensuality = sensuality;
        this.internetEnabled = internetEnabled;
        this.toneExamples = toneExamples;
    }
}

export function createPersonalityCard(personality) {
    const personalityCard = document.createElement("label");
    personalityCard.classList.add("card-personality");
    personalityCard.innerHTML = `
            <img class="background-img" src="${personality.image}"></img>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                <button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}">edit</button>
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}">share</button>
                <button class="btn-textual btn-delete-card material-symbols-outlined"
                    id="btn-delete-personality-${personality.name}">delete</button>
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    // Add event listeners
    const shareButton = personalityCard.querySelector(".btn-share-card");
    const deleteButton = personalityCard.querySelector(".btn-delete-card");
    const editButton = personalityCard.querySelector(".btn-edit-card");
    const input = personalityCard.querySelector("input");
    if (shareButton) {
        shareButton.addEventListener("click", () => {
            sharePersonality(personality);
        });
    }
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            //first if the personality to delete is the one currently selected, we select the default personality
            if (input.checked) {
                getPersonalityCard(0).click();
            }
            //we can't call indexOf on a HTMLCollection, so we convert it to an array first
            const index = getPersonalityIndex(personalityCard);
            deletePersonality(index);
            personalityCard.remove();
        });
    }
    editButton.addEventListener("click", () => {
        const personalityToEditIndex = Array.from(personalityCard.parentNode.children).indexOf(personalityCard);
        if (personalityToEditIndex <= 0) { return }
        showEditPersonalityForm(personalityToEditIndex);
    });
    input.addEventListener("change", () => {
        const personalityCards = document.getElementsByClassName("card-personality");
        if (input.checked) {
            // Darken all cards
            [...personalityCards].forEach(card => {
                card.classList.remove("selected-card");
                card.classList.remove("selected-card-after-transition");
            })
            // Lighten selected card
            input.parentElement.classList.add("selected-card");
            setTimeout(() => {
                input.parentElement.classList.add("selected-card-after-transition");
            }, 250);
        }

    });
    return personalityCard;
}