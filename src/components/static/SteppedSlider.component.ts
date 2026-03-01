export class SteppedSlider {
    public container: HTMLElement;
    public input: HTMLInputElement;
    public buttons: NodeListOf<HTMLButtonElement>;

    constructor(container: HTMLElement) {
        this.container = container;
        this.input = container.querySelector('input[type="hidden"]') as HTMLInputElement;
        this.buttons = container.querySelectorAll('.stepped-slider-btn');
        
        if (!this.input || this.buttons.length === 0) {
            console.error("SteppedSlider properly formatted elements not found", container);
            return;
        }

        this.buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const value = btn.dataset.value;
                if (value !== undefined) {
                    this.setValue(value);
                    // Dispatch event for listeners
                    this.input.dispatchEvent(new Event('input', { bubbles: true }));
                    this.input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });

        // Initialize state
        this.updateActiveButton(this.input.value);

        // Listen for external changes to the input
        this.input.addEventListener('input', () => {
             this.updateActiveButton(this.input.value);
        });
    }

    public setValue(value: string) {
        this.input.value = value;
        this.updateActiveButton(value);
    }

    private updateActiveButton(value: string) {
        this.buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    }
}

// Auto-initialize all stepped sliders immediately
const sliders = document.querySelectorAll('.stepped-slider');
sliders.forEach(slider => new SteppedSlider(slider as HTMLElement));
