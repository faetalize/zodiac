function updateStepper(stepper) {
    const steps = stepper.element.querySelectorAll(".step");
    console.log(stepper);
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

const elements = document.querySelectorAll(".stepper");
const steppers = Array.from(elements).map( (element) => ({element: element, step: 0}));

for (const stepper of steppers) {
    const next = stepper.element.querySelector("#btn-stepper-next");
    const prev = stepper.element.querySelector("#btn-stepper-previous");
    next.addEventListener("click", () => {
        stepper.step++;
        updateStepper(stepper);
    });
    prev.addEventListener("click", () => {
        stepper.step--;
        updateStepper(stepper);
    });
}

