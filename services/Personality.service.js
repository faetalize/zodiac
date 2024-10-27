import { createPersonalityCard } from "../components/Personality.component";
import * as helpers from "../utils/helpers.util";
import * as overlayService from "./Overlay.service";

function setupDefaultPersonality() {
    const defaultPersonalityJSON = {
        name: 'zodiac',
        image: 'https://images.fonearena.com/blog/wp-content/uploads/2023/12/Google-Gemini-AI-1024x577.jpg',
        description: 'zodiac is a cheerful assistant, always ready to help you with your tasks.',
        prompt: "You are zodiac, a helpful assistant created by faetalize, built upon Google's Gemini Pro model. Gemini Pro is a new LLM (Large Language Model) release by Google on December 2023. Your purpose is being a helpful assistant to the user."
    }
    const defaultPersonalityCard = createPersonalityCard(defaultPersonalityJSON);
    insertPersonality(defaultPersonalityCard);
    //add default personality card event listeners and initial state
    const shareButton = defaultPersonalityCard.querySelector(".btn-share-card");
    const editButton = defaultPersonalityCard.querySelector(".btn-edit-card");
    const deleteButton = defaultPersonalityCard.querySelector(".btn-delete-card");
    const input = defaultPersonalityCard.querySelector("input");
    editButton.addEventListener("click", () => {
        alert("You cannot edit the default personality card.");
        return;
    });
    deleteButton.remove();
    input.click();
}


export function getSelectedPersonality() {
    return document.querySelector("input[name='personality']:checked");
}

export function getLocalPersonalities() {
    const personalitiesJSON = localStorage.getItem("personalities");
    return personalitiesJSON;
}

export function deleteLocalPersonality(index) {
    let localPers = JSON.parse(getLocalPersonalities());
    localPers = localPers.splice(index, 1);
    localStorage.setItem("personalities", JSON.stringify(localPers));
}

export function insertPersonality(personalityCard) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    personalitiesDiv.append(personalityCard);
    helpers.darkenCard(personalityCard);
}

export function sharePersonality(personalityCard) {
    //export personality to json
    const personalityJSON = {
        name: personalityCard.querySelector(".personality-title").innerText,
        description: personalityCard.querySelector(".personality-description").innerText,
        prompt: personalityCard.querySelector(".personality-prompt").innerText,
        image: personalityCard.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '')
    }
    const personalityJSONString = JSON.stringify(personalityJSON);
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityJSONString));
    element.setAttribute('download', `${personalityJSON.name}.json`);
    element.style.display = 'none';
    //appending the element is required for firefox
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function initializePersonalities() {
    const personalityCards = document.querySelectorAll(".card-personality");
    personalityCards.forEach((card)=>{card.remove()});
    setupDefaultPersonality();
    const personalitiesArray = JSON.parse(getLocalPersonalities());
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insertPersonality(createPersonalityCard(personality));
        }
    }

}

export function clearAllPersonalities(){
    localStorage.removeItem("personalities");
    const personalityCards = document.querySelectorAll(".card-personality");
    [...personalityCards].forEach(card => {
        if (card != defaultPersonalityCard) {
            card.remove();
        }
    });
}

export function submitNewPersonality() {
    const personalityName = document.querySelector("#form-add-personality #personalityNameInput");
    const personalityDescription = document.querySelector("#form-add-personality #personalityDescriptionInput");
    const personalityImageURL = document.querySelector("#form-add-personality #personalityImageURLInput");
    const personalityPrompt = document.querySelector("#form-add-personality #personalityPromptInput");

    if (personalityName.value == "") {
        alert("Please enter a personality name");
        return;
    }
    if (personalityPrompt.value == "") {
        alert("Please enter a personality prompt");
        return;
    }

    //to json
    const personalityJSON = {
        name: personalityName.value,
        description: personalityDescription.value,
        prompt: personalityPrompt.value,
        image: personalityImageURL.value
    }
    insertPersonality(createPersonalityCard(personalityJSON));
    setLocalPersonality(personalityJSON);
    overlayService.closeOverlay();
}

export function setLocalPersonality(personalityJSON) {
    const savedPersonalities = JSON.parse(localStorage.getItem("personalities"));
    let newSavedPersonalities = [];
    if (savedPersonalities) {
        newSavedPersonalities = [...savedPersonalities, personalityJSON];
    }
    else {
        newSavedPersonalities = [personalityJSON];
    }
    localStorage.setItem("personalities", JSON.stringify(newSavedPersonalities));
}

export function getPersonalityByIndex(index) {
    const personalities = JSON.parse(getLocalPersonalities());
    return personalities[index-1]; // -1 because the default personality is not in the array
}

export function submitPersonalityEdit(personalityIndex, personalityJSON) {
    const personalities = JSON.parse(getLocalPersonalities());
    personalities[personalityIndex-1] = personalityJSON;
    localStorage.setItem("personalities", JSON.stringify(personalities));
    initializePersonalities();
}

export function getPersonalityCard(index) {

    const personalityCards = document.getElementsByClassName("card-personality");
    if (index <= 0) {
        return personalityCards[0];
    }
    return personalityCards[index];
}