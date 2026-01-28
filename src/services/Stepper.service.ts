
const steppers = [...document.querySelectorAll<HTMLElement>(".stepper")].map((element) => ({ element: element, step: 0 }));

export function update(stepper: { element: HTMLElement; step: number }) {
    const steps = Array.from(stepper.element.querySelectorAll<HTMLElement>(".step"));
    const activeSteps = steps.filter(step => !step.hasAttribute("data-stepper-skip"));
    const visibleSteps = activeSteps.length > 0 ? activeSteps : steps;
    stepper.step = Math.max(0, Math.min(stepper.step, visibleSteps.length - 1));
    stepper.element.classList.toggle("first-step", stepper.step === 0);
    stepper.element.classList.toggle("final-step", stepper.step === visibleSteps.length - 1);
    //hide all other steps
    for (const step of steps) {
        if (step !== visibleSteps[stepper.step]) {
            step.classList.remove("active");
        }
        else {
            step.classList.add("active");
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
