import * as helpers from "../../utils/helpers";
const tabGroups = document.querySelectorAll<HTMLElement>(".navbar");

interface TabView {
    setActiveTab: (targetIndex: number) => void;
    activeTabIndex: number;
    tabs: NodeListOf<HTMLElement>;
    tabHighlight: HTMLElement;
    views: HTMLCollectionOf<HTMLElement>;
}

for (const tabGroup of tabGroups) {
    const tabHighlight = tabGroup.querySelector<HTMLElement>(".navbar-tab-highlight");
    const tabs = tabGroup.querySelectorAll<HTMLElement>(".navbar-tab");
    const views = document.querySelector(`#${tabGroup.dataset.targetId}`)!.children as HTMLCollectionOf<HTMLElement>;
    if (!tabHighlight) {
        console.error("Tab highlight element not found. Please check the HTML structure.");
        throw new Error("Tab highlight element is not properly initialized.");
    }
    //tab setup
    if (tabs.length === 0) {
        console.error("No tabs found in the tab view. Please check the HTML structure.");
        throw new Error("Tab view is not properly initialized.");
    }
    if (views.length === 0) {
        console.error("No views found in the tab view. Please check the HTML structure.");
        throw new Error("Tab view is not properly initialized.");
    }
    if (tabs.length !== views.length) {
        console.error("Number of tabs and views do not match. Please check the HTML structure.");
        console.log("Tabs:", tabs.length, "Views:", views.length);  
        throw new Error("Tab view is not properly initialized.");
    }
    if (!tabHighlight) {
        console.error("Tab highlight element not found. Please check the HTML structure.");
        throw new Error("Tab highlight element is not properly initialized.");
    }
    tabHighlight!.style.width = `calc(100% / ${tabs.length})`;
    tabHighlight!.style.left = `calc(100% / ${tabs.length} * 0)`;
    //set the first tab as active
    tabs[0].classList.add("navbar-tab-active");

    const t: TabView = {
        setActiveTab: (targetIndex: number) => {
            if (targetIndex === t.activeTabIndex) {
                return;
            }
            const currentTab = t.tabs[t.activeTabIndex];
            const currentView = t.views[t.activeTabIndex];
            currentTab.classList.remove("navbar-tab-active");
            const targetView = t.views[targetIndex];
            const targetTab = t.tabs[targetIndex];
            targetTab.classList.add("navbar-tab-active");
            tabHighlight!.style.left = `calc(100% / ${tabs.length} * ${targetIndex})`;
            helpers.hideElement(currentView);
            t.activeTabIndex = targetIndex;
            helpers.showElement(targetView, true);
        },
        activeTabIndex: 0,
        tabs: tabs,
        tabHighlight: tabHighlight,
        views: views,
    };


    for (const tab of tabs) {
        tab.addEventListener("click", () => {
            const targetTabIndex = Array.from(tabs).indexOf(tab);
            t.setActiveTab(targetTabIndex);
        });
    }

    t.setActiveTab(0);
}