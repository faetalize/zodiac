import { Personality } from '../models/Personality';
import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';

const overlay = document.querySelector<HTMLElement>(".overlay")!;
const overlayItems = overlay.querySelector<HTMLElement>(".overlay-content")!.children;
const personalityForm = document.querySelector<HTMLElement>("#form-add-personality")!;

export function showEditChatTitleForm(){
    const editChatTitleForm = document.querySelector<HTMLElement>("#form-edit-chat-title");
    if (!editChatTitleForm) {
        console.error("Edit chat title form not found");
        throw new Error("Edit chat title form not found");
    }
    showElement(overlay, false);
    showElement(editChatTitleForm, false);
}

export function showAddPersonalityForm() {
    showElement(overlay, false);
    showElement(personalityForm, false);
}

export function showEditPersonalityForm(personality: Personality) {
    //populate the form with the personality data
    for (const key in personality) {
        
        if (key === 'toneExamples') {
            for (const [index, tone] of personality.toneExamples.entries()) {
                if (index === 0) {
                    const input = personalityForm.querySelector<HTMLInputElement>(`input[name="tone-example-1"]`)!;
                    input.value = tone;
                    continue;
                }
                const input = document.createElement('input');
                input.type = 'text';
                input.name = `tone-example-${index}`;
                input.classList.add('tone-example');
                input.placeholder = 'Tone example';
                input.value = tone;
                personalityForm.querySelector("#btn-add-tone-example")!.before(input);
            }
        }
        const input = personalityForm.querySelector<HTMLInputElement>(`[name="${key}"]`);
        if (!input) {
            continue;
        }
        input.value = personality[key as keyof Personality].toString();
        if (input.type === 'checkbox') {
            input.checked = Boolean(personality[key as keyof Personality]);
        }
    }
    showElement(overlay, false);
    showElement(personalityForm, false);
}

export function showChangelog() {
    const whatsNew = document.querySelector<HTMLElement>("#whats-new")!;
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export function closeOverlay() {
    hideElement(overlay);

    for (const item of overlayItems) {
        hideElement(item as HTMLElement);
        //reset the form and stepper
        if (item instanceof HTMLFormElement) {
            item.reset();
            //remove all but the first tone example
            item.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) {
                    element.remove();
                }
            });
            const stepper = stepperService.get(item.firstElementChild!.id);
            if (stepper) {
                stepper.step = 0;
                stepperService.update(stepper);
            }
        }
    }
}