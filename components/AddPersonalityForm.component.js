import { createPersonalityCard, Personality } from "./PersonalityCard.component";
import * as personalityService from '../services/Personality.service';

function makePersonality(form) {
    //turn all the form data into a personality object
    const personality = new Personality();
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
        if (key.includes("tone")) {
            personality.toneExamples.push(value);
            continue;
        }
        personality[key] = value;
    }
    return personality;
}

const form = document.querySelector("#form-add-personality");
form.submit = () => {
    personalityService.submitNewPersonality(makePersonality(form));
}

//this code is for setting up the add tone example button
const btn = document.querySelector('#btn-add-tone-example');
btn.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
    input.classList.add('tone-example');
    input.placeholder = 'Tone example';
    btn.before(input);
});