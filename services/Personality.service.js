import { createPersonalityCard, Personality } from "../components/PersonalityCard.component";
import * as overlayService from "./Overlay.service";



export function getSelectedPersonality() {
    const selectedPersonalityCard = document.querySelector("input[name='personality']:checked").parentElement;
    const index = getPersonalityIndex(selectedPersonalityCard);
    return getPersonalityByIndex(index);
}

export function getPersonalityIndex(personalityCard){
    const index = Array.from(document.querySelectorAll(".card-personality")).indexOf(personalityCard);
    //we don't count the default personality
    return index-1;
}

export function getAllPersonalities() {
    const personalities = localStorage.getItem("personalities");
    if (!personalities) {
        return [];
    };
    return JSON.parse(personalities);
}

export function deletePersonality(index) {
    let localPers = getAllPersonalities();
    localPers.splice(index, 1);
    localStorage.setItem("personalities", JSON.stringify(localPers));
}

export function insertPersonality(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = createPersonalityCard(personality);
    personalitiesDiv.append(card);
    return card;
}

export function sharePersonality(personality) {
    //export personality to a string
    const personalityString = JSON.stringify(personality);
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
    //appending the element is required for firefox
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function clearAllPersonalities() {
    localStorage.removeItem("personalities");
    initializePersonalities();
}

export function submitNewPersonality(personality) {
    if (personality.name == "") {
        alert("Please enter a personality name");
        return;
    }
    if (personality.prompt == "") {
        alert("Please enter a personality prompt");
        return;
    }
    insertPersonality(personality);
    addPersonality(personality);
    overlayService.closeOverlay();
}

export function addPersonality(personality) {
    const savedPersonalities = getAllPersonalities();
    localStorage.setItem("personalities", JSON.stringify([...savedPersonalities, personality]));
}

export function getPersonalityByIndex(index) {
    if (index <= 0) {
        return defaultPersonality;
    }
    const personalities = getAllPersonalities();
    return personalities[index - 1]; // -1 because the default personality is not in the array
}

export function submitPersonalityEdit(personalityIndex, personalityJSON) {
    const personalities = JSON.parse(getAllPersonalities());
    personalities[personalityIndex - 1] = personalityJSON;
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