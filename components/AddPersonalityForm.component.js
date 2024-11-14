import { getStepperById } from "../services/Stepper.service";
import { Personality, createPersonalityCard } from "./PersonalityCard.component";

function updateSummary(stepper) {
    //check if the stepper has a summary section
    if (!stepper.element.querySelector(".summary")) {
        return;
    }

    const data = new FormData(stepper.element.parentElement);
    //turn into object while ensuring the tone examples are an array
    const summary = new Personality();
    for (const [key, value] of data.entries()) {
        if (key.includes("tone-example")) {
            if (!summary.toneExamples) {
                summary.toneExamples = [];
            }
            summary.toneExamples.push(value);
        }
        else {
            summary[key] = value;
        }
    }

    console.log(summary);
    //we update the summary when the form's data changes
    const card = createPersonalityCard(summary);
    card.querySelector("input").remove();
    card.querySelectorAll("button").forEach(button => button.remove());
    card.classList.add("selected-card");
    stepper.element.querySelector(".summary>.card-summary").innerHTML = card.outerHTML;
    stepper.element.querySelector(".summary .details .prompt").innerHTML = summary.prompt;
    stepper.element.querySelector(".summary .details .sensuality").innerHTML = summary.sensuality + "/3";
    stepper.element.querySelector(".summary .details .aggressiveness").innerHTML = summary.aggressiveness + "/3";
    stepper.element.querySelector(".summary .details .roleplay").innerHTML = summary.roleplayEnabled;
    stepper.element.querySelector(".summary .details .internet-access").innerHTML = summary.internetEnabled
}

const form = document.querySelector("#form-add-personality");
const inputs = form.querySelectorAll("input");
const textareas = form.querySelectorAll("textarea");
const stepper = getStepperById("stepper-add-personality");
for (const input of inputs) {
    input.addEventListener("input", () => updateSummary(stepper));
}
for (const textarea of textareas) {
    textarea.addEventListener("input", () => updateSummary(stepper));
}
stepper.element.querySelector("#btn-stepper-next").addEventListener("click", () => updateSummary(stepper));

//override the form submit
form.submit = (e) => {
    console.log("submitting");
}

HTMLAllCollection.prototype.forEach = Array.prototype.forEach;

