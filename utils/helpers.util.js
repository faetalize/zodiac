export function hideElement(element) {
    element.style.transition = 'opacity 0.2s';
    element.style.opacity = '0';
    setTimeout(function () {
        element.style.display = 'none';
    }, 200);
}

export function showElement(element, wait) {
    let timeToWait = 0
    if (wait) {
        timeToWait = 200;
    }
    setTimeout(function () {
        element.style.display = 'flex';
        element.style.opacity = '0';  //required as certain elements arent opacity 0 despite being hidden
        element.style.transition = 'opacity 0.2s';
        requestAnimationFrame(function () {
            requestAnimationFrame(function(){
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



let currentTab = undefined;

export function tabsFirstTimeSetup() {
    const tabs = document.getElementsByClassName("navbar-tab");
    const sidebarViews = document.getElementsByClassName("sidebar-section");
    const tabHighlight = document.querySelector(".navbar-tab-highlight");
    tabHighlight.style.width = `calc(100% / ${tabs.length})`;
    [...tabs].forEach(tab => {
        tab.addEventListener("click", () => {
            navigateTo(tab);
        })
    });

    [...sidebarViews].forEach(view => {
        hideElement(view);
    });
    navigateTo(tabs[0]);
}


export function navigateTo(tab) {
    const sidebarViews = document.getElementsByClassName("sidebar-section");
    const tabs = document.getElementsByClassName("navbar-tab");
    const tabHighlight = document.querySelector(".navbar-tab-highlight");
    if (tab == tabs[currentTab]) {
        return;
    }
    tab.classList.add("navbar-tab-active");

    // set the highlight to match the size of the tab element
    let tabIndex = [...tabs].indexOf(tab);
    if (tabIndex < 0 || tabIndex >= sidebarViews.length) {
        console.error("Invalid tab index: " + tabIndex);
        return;
    }

    if (currentTab !== undefined) {
        hideElement(sidebarViews[currentTab]);
        tabs[currentTab].classList.remove("navbar-tab-active");
    }
    showElement(sidebarViews[tabIndex], true);
    currentTab = tabIndex;

    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${tabIndex})`;

}