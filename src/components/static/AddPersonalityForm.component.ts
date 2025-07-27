import { Personality } from "../../models/Personality";
import * as personalityService from '../../services/Personality.service';
import * as overlayService from '../../services/Overlay.service';

const form = document.querySelector<HTMLFormElement>("#form-add-personality");
const btn = document.querySelector<HTMLButtonElement>('#btn-add-tone-example');

if (!form || !btn) {
    console.error("Form or add tone example button is misconfigured, abort");
    throw new Error("Form or add tone example button is misconfigured, abort");
}

form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission on Enter key
        }
        if (e.key === 'Escape') {
            overlayService.closeOverlay(); // Close the overlay on Escape key
        }
    }
    );
});

form.submit = () => {
        //turn all the form data into a personality object
        const personality: Personality = {
            name: '',
            aggressiveness: 0,
            description: '',
            image: '',
            internetEnabled: false,
            prompt: '',
            roleplayEnabled: false,
            sensuality: 0,
            toneExamples: []
        };
        const data = new FormData(form);
        for (const [key, value] of data.entries()) {
            if (key.includes("tone")) {
                if (value) {
                    personality.toneExamples.push(value.toString());
                }
                continue;
            }
            if (key === 'id') {
                continue;
            }
            if (key === 'aggressiveness' || key === 'sensuality') {
                personality[key] = Number(value);
            } else if (key === 'description' || key === 'image' || key === 'name' || key === 'prompt') {
                personality[key] = value.toString();
            }
            else if (key === 'internetEnabled' || key === 'roleplayEnabled') {
                personality[key] = Boolean(value);
            } else {
                console.warn(`Unhandled form key: ${key}`);
            }
        }

        //handle both edit and add cases
        const id = Number(data.get('id'));
        if (id) {
            personalityService.edit(id, personality);
        }
        else {
            personalityService.add(personality);
        }

        overlayService.closeOverlay();
    }

//this code is for setting up the `add tone example` button
btn.addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
        input.classList.add('tone-example');
        input.placeholder = 'Tone example';
        btn.before(input);
    });