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
        //Use requestSubmit when available so the form's submit event handlers run
        //and can prevent navigation. Fall back to dispatching a cancelable submit
        //event for older browsers.
        try {
            if (typeof (form as any).requestSubmit === 'function') {
                (form as any).requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        } catch (err) {
            console.error('Stepper submit delegation failed, falling back to native submit', err);
            form.submit();
        }
    });
}