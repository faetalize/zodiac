import * as helpers from "../utils/helpers";

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const tabs = document.querySelectorAll(".navbar-tab");
const tabHighlight = document.querySelector("#navbar-tab-highlight");
const sidebarViews = document.querySelectorAll(".sidebar-section");

hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
    helpers.showElement(sidebar, false);
});

let activeTabIndex = undefined;
function navigateTo(tab) {
    const index = [...tabs].indexOf(tab);
    if (index == activeTabIndex) {
        return;
    }
    tab.classList.add("navbar-tab-active");
    //hide active view before proceding
    if (activeTabIndex !== undefined) {
        helpers.hideElement(sidebarViews[activeTabIndex]);
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
    }
    helpers.showElement(sidebarViews[index], true);
    activeTabIndex = index;
    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${index})`;
}
//tab setup
tabHighlight.style.width = `calc(100% / ${tabs.length})`;
for(const tab of tabs){
    tab.addEventListener("click", () => {
        navigateTo(tab);
    });
}

navigateTo(tabs[0]);
