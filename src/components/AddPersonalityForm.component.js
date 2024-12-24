import { Personality } from "../services/Personality.service";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';

const form = document.querySelector("#form-add-personality");
const stepper = stepperService.get('stepper-add-personality');
const btn = document.querySelector('#btn-add-tone-example');

form.submit = () => {
    //turn all the form data into a personality object
    const personality = new Personality();
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
        if (key.includes("tone")) {
            if(value){
                personality.toneExamples.push(value);
            }
            continue;
        }
        if (key === 'id') {
            continue;
        }
        personality[key] = value;
    }

    //handle both edit and add cases
    const id = data.get('id');
    if (id) {
        personalityService.edit(parseInt(id), personality);
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