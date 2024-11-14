// Description: This file contains helper functions that are used throughout the application.

export function hideElement(element) {
    if (!element) {
        return;
    }
    element.style.transition = 'opacity 0.2s';
    element.style.opacity = '0';
    setTimeout(function () {
        element.style.display = 'none';
    }, 200);
}

export function showElement(element, wait) {
    if (!element) {
        return;
    }
    let timeToWait = 0
    if (wait) {
        timeToWait = 200;
    }
    setTimeout(function () {
        element.style.display = 'flex';
        element.style.opacity = '0';  //required as certain elements arent opacity 0 despite being hidden
        element.style.transition = 'opacity 0.2s';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                element.style.opacity = '1';
            });
        });
    }, timeToWait);
}

export function darkenCard(element) {
    let elementBackgroundImageURL = element.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '');
    element.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${elementBackgroundImageURL}')`;
}


export function lightenCard(element) {
    let elementBackgroundImageURL = element.style.backgroundImage.match(/url\((.*?)\)/)[1].replace(/('|")/g, '');
    element.style.backgroundImage = `url('${elementBackgroundImageURL}')`;
}



export function getVersion(){
    return "0.8";
}