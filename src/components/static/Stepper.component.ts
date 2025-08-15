//all steppers are expected to have a next, previous and submit button
//steppers are also expected to be children of a form element
import *  as stepperService from "../../services/Stepper.service";

const steppers = stepperService.getAll();

for (const stepper of steppers) {
    const form = stepper.element.parentElement as HTMLFormElement;
    const next = stepper.element.querySelector(".btn-stepper-next");
    const prev = stepper.element.querySelector(".btn-stepper-previous");
    const submit = stepper.element.querySelector(".btn-stepper-submit");
    if (!form || !next || !prev || !submit) {
        console.error("Stepper buttons not found or form is missing.");
        console.log(stepper);
        continue;
    }
    next.addEventListener("click", () => {
        stepper.step++;
        stepperService.update(stepper);
    });
    prev.addEventListener("click", () => {
        stepper.step--;
        stepperService.update(stepper);
    });
    submit.addEventListener("click", (e) => {
        e.preventDefault();
        //delegate the submit to the form containing the stepper
        form.submit();
    });
}