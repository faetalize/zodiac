const subscriptionFeatureItems = Array.from(
    document.querySelectorAll<HTMLLIElement>("#form-subscription .feature-item:not(.feature-item-inherited)")
);

subscriptionFeatureItems.forEach((item) => {
    const featureText = item.querySelector<HTMLElement>(".feature-text");
    if (!featureText) return;

    let viewport = item.querySelector<HTMLElement>(".feature-text-viewport");

    if (!viewport) {
        viewport = document.createElement("span");
        viewport.className = "feature-text-viewport";
        featureText.parentElement?.insertBefore(viewport, featureText);
        viewport.appendChild(featureText);
    }
});

function updateFeatureMarquee(): void {
    subscriptionFeatureItems.forEach((item) => {
        const viewport = item.querySelector<HTMLElement>(".feature-text-viewport");
        const featureText = item.querySelector<HTMLElement>(".feature-text");

        if (!viewport || !featureText) return;

        item.classList.remove("feature-item-marquee");
        item.style.removeProperty("--feature-overflow-distance");
        item.style.removeProperty("--feature-marquee-duration");

        const overflow = Math.ceil(featureText.scrollWidth - viewport.clientWidth);

        if (overflow <= 0) return;

        const durationSeconds = Math.max(6, Math.min(14, 4 + overflow / 28));

        item.classList.add("feature-item-marquee");
        item.style.setProperty("--feature-overflow-distance", `${overflow}px`);
        item.style.setProperty("--feature-marquee-duration", `${durationSeconds}s`);
    });
}

const featureMarqueeResizeObserver = new ResizeObserver(() => {
    updateFeatureMarquee();
});

subscriptionFeatureItems.forEach((item) => {
    featureMarqueeResizeObserver.observe(item);
});

window.addEventListener("load", updateFeatureMarquee);
window.addEventListener("resize", updateFeatureMarquee);

updateFeatureMarquee();
