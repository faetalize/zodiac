/**
 * Collapsible Subscription Cards Component
 * Handles mobile collapsible behavior for subscription cards
 */

const MOBILE_BREAKPOINT = 1032;

interface CollapsibleCard {
    card: HTMLElement;
    header: HTMLElement;
    body: HTMLElement;
    button: HTMLElement;
    isExpanded: boolean;
}

const collapsibleCards: CollapsibleCard[] = [];

/**
 * Initialize collapsible subscription cards
 */
function init(): void {
    // Onboarding cards
    const onboardingProCard = document.getElementById("onboarding-pro-card");
    const onboardingMaxCard = document.getElementById("onboarding-max-card");

    // Profile panel cards
    const profileFreeCard = document.getElementById("profile-free-card");
    const profileProCard = document.getElementById("profile-pro-card");
    const profileMaxCard = document.getElementById("profile-max-card");

    const cards = [
        onboardingProCard,
        onboardingMaxCard,
        profileFreeCard,
        profileProCard,
        profileMaxCard
    ].filter((card): card is HTMLElement => card !== null);

    cards.forEach(card => {
        const header = card.querySelector(".subscription-card-header") as HTMLElement;
        const body = card.querySelector(".subscription-card-body") as HTMLElement;
        const button = card.querySelector(".subscription-cta") as HTMLElement;

        if (!header || !body) {
            console.error("Subscription card missing required elements:", card.id);
            return;
        }

        const collapsibleCard: CollapsibleCard = {
            card,
            header,
            body,
            button,
            isExpanded: false
        };

        collapsibleCards.push(collapsibleCard);

        // Add click handler to header
        header.style.cursor = "pointer";
        header.addEventListener("click", () => toggleCard(collapsibleCard));

        // Add expand indicator to header
        const expandIndicator = document.createElement("span");
        expandIndicator.className = "material-symbols-outlined subscription-expand-indicator";
        expandIndicator.textContent = "chevron_left";
        header.appendChild(expandIndicator);
    });

    // Check initial state
    handleResize();

    // Add resize listener
    window.addEventListener("resize", handleResize);
}

/**
 * Toggle card expanded/collapsed state
 */
function toggleCard(collapsibleCard: CollapsibleCard): void {
    // Only allow toggling on mobile
    if (window.innerWidth > MOBILE_BREAKPOINT) {
        return;
    }

    collapsibleCard.isExpanded = !collapsibleCard.isExpanded;
    updateCardState(collapsibleCard);
}

/**
 * Update visual state of card
 */
function updateCardState(collapsibleCard: CollapsibleCard): void {
    const { card, body, button, isExpanded } = collapsibleCard;
    const indicator = card.querySelector(".subscription-expand-indicator") as HTMLElement;

    if (window.innerWidth <= MOBILE_BREAKPOINT) {
        if (isExpanded) {
            card.classList.add("subscription-card-expanded");
            card.classList.remove("subscription-card-collapsed");
            if (indicator) indicator.textContent = "expand_more";
        } else {
            card.classList.add("subscription-card-collapsed");
            card.classList.remove("subscription-card-expanded");
            if (indicator) indicator.textContent = "chevron_left";
        }
    } else {
        // Desktop: always expanded
        card.classList.remove("subscription-card-collapsed", "subscription-card-expanded");
        if (indicator) indicator.style.display = "none";
    }
}

/**
 * Handle window resize
 */
function handleResize(): void {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    collapsibleCards.forEach(collapsibleCard => {
        const indicator = collapsibleCard.card.querySelector(".subscription-expand-indicator") as HTMLElement;
        
        if (isMobile) {
            // Collapse all cards on mobile by default
            if (!collapsibleCard.card.classList.contains("subscription-card-collapsed") && 
                !collapsibleCard.card.classList.contains("subscription-card-expanded")) {
                collapsibleCard.isExpanded = false;
            }
            if (indicator) indicator.style.display = "block";
        } else {
            // Desktop: show all content, hide indicators
            collapsibleCard.card.classList.remove("subscription-card-collapsed", "subscription-card-expanded");
            if (indicator) indicator.style.display = "none";
        }
        
        updateCardState(collapsibleCard);
    });
}

// Initialize on module load
init();
