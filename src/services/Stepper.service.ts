
const steppers = [...document.querySelectorAll<HTMLElement>(".stepper")].map((element) => ({ element: element, step: 0 }));

export function update(stepper: { element: HTMLElement; step: number }) {
    const steps = stepper.element.querySelectorAll<HTMLElement>(".step");
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

export function getStep(stepper: { element: HTMLElement; step: number }, index: number) {
    return stepper.element.querySelectorAll(".step")[index];
}

export function get(id: string): { element: HTMLElement; step: number } | undefined {
    return steppers.find(stepper => stepper.element.id === id);
}

export function getAll(){
    return steppers;
}

