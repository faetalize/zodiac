export function getStep(stepper, index){
    return stepper.element.querySelectorAll(".step")[index];
}

export function getStepperById(id) {
    const steppers = getAllSteppers();
    return steppers.find(stepper => stepper.element.id === id);
}

export function getAllSteppers(){
    const elements = document.querySelectorAll(".stepper");
    return Array.from(elements).map((element) => ({ element: element, step: 0 }));
}

