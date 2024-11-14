//all steppers are expected to have a next, previous and submit button
//steppers are also expected to be children of a form element
import { getAllSteppers } from "../services/Stepper.service";

function updateStepper(stepper) {
    const steps = stepper.element.querySelectorAll(".step");
    stepper.step = Math.max(0, Math.min(stepper.step, steps.length - 1));
    stepper.element.classList.toggle("first-step", stepper.step === 0);
    stepper.element.classList.toggle("final-step", stepper.step === steps.length - 1);
    //hide all other steps
    for (let i = 0; i < steps.length; i++) {
        if (i != stepper.step) {
            steps[i].classList.remove("active");
        }
        else {
            steps[i].classList.add("active");
        }
    }
}

const steppers = getAllSteppers();
for (const stepper of steppers) {
    const next = stepper.element.querySelector("#btn-stepper-next");
    const prev = stepper.element.querySelector("#btn-stepper-previous");
    const submit = stepper.element.querySelector("#btn-stepper-submit");
    next.addEventListener("click", () => {
        stepper.step++;
        updateStepper(stepper);
    });
    prev.addEventListener("click", () => {
        stepper.step--;
        updateStepper(stepper);
    });
    submit.addEventListener("click", (e) => {
        e.preventDefault();
        //delegate the submit to the form
        const form = stepper.element.parentElement;
        form.submit();
    });
}

