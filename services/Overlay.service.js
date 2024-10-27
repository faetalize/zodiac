import {showElement, hideElement} from '../utils/helpers.util';
import { getPersonalityByIndex, submitPersonalityEdit } from './Personality.service';
const formsOverlay = document.querySelector(".overlay");
const addPersonalityForm = document.querySelector("#form-add-personality");
const editPersonalityForm = document.querySelector("#form-edit-personality");

export function showAddPersonalityForm() {
    showElement(formsOverlay, false);
    showElement(addPersonalityForm, false);
}

export function showEditPersonalityForm(personalityIndex) {
    showElement(formsOverlay, false);
    showElement(editPersonalityForm, false);
    const personality = getPersonalityByIndex(personalityIndex);
    editPersonalityForm.querySelector("#personalityNameInput").value = personality.name;
    editPersonalityForm.querySelector("#personalityDescriptionInput").value = personality.description;
    editPersonalityForm.querySelector("#personalityPromptInput").value = personality.prompt;
    editPersonalityForm.querySelector("#personalityImageURLInput").value = personality.image;
    editPersonalityForm.querySelector("#personalityIndex").value = personalityIndex;

}

export function editPersonalityFormSubmit() {
    const personalityJSON = {
        name: editPersonalityForm.querySelector("#personalityNameInput").value,
        description: editPersonalityForm.querySelector("#personalityDescriptionInput").value,
        prompt: editPersonalityForm.querySelector("#personalityPromptInput").value,
        image: editPersonalityForm.querySelector("#personalityImageURLInput").value
    }
    const personalityIndex = editPersonalityForm.querySelector("#personalityIndex").value;
    submitPersonalityEdit(personalityIndex, personalityJSON);
    closeOverlay();
}

export function closeOverlay() {
    hideElement(formsOverlay);
    hideElement(addPersonalityForm);
    hideElement(editPersonalityForm);
    hideElement(document.querySelector("#whats-new"));
}