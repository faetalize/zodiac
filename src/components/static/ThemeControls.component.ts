import { themeService } from '../../services/Theme.service';
import type { ColorTheme } from '../../types/Theme';
import * as toastService from '../../services/Toast.service';
import { ToastSeverity } from '../../types/Toast';

// Query all required elements
const modeInput = document.querySelector<HTMLInputElement>('#themeMode');
const themeButtons = document.querySelectorAll<HTMLButtonElement>('.theme-btn');

if (!modeInput || !themeButtons.length) {
    console.error('Theme control elements not found in DOM');
    throw new Error('Theme control elements not found');
}
const modeInputElement = modeInput;

// Implemented themes (others are placeholders)
const IMPLEMENTED_THEMES: ColorTheme[] = ['blue', 'red', 'green', 'purple', 'monochrome'];
const MODE_TO_VALUE: Record<'light' | 'auto' | 'dark', string> = {
    light: '0',
    auto: '1',
    dark: '2',
};

function initialize() {
    console.log('[ThemeControls] Initializing theme controls');
    
    modeInputElement.addEventListener('input', handleModeInput);
    
    // Set up theme buttons
    themeButtons.forEach(button => {
        const theme = button.getAttribute('data-theme') as ColorTheme;
        
        // Mark non-implemented themes as disabled
        if (!IMPLEMENTED_THEMES.includes(theme)) {
            button.classList.add('disabled');
        }
        
        button.addEventListener('click', handleThemeClick);
    });
    
    // Update UI to reflect current state
    updateUI();
    
    console.log('[ThemeControls] Theme controls initialized');
}

// Auto-initialize when component loads
initialize();

function handleModeInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;

    if (input.value === MODE_TO_VALUE.auto) {
        themeService.setAutoMode();
    } else if (input.value === MODE_TO_VALUE.light) {
        themeService.setMode('light', 'manual');
    } else if (input.value === MODE_TO_VALUE.dark) {
        themeService.setMode('dark', 'manual');
    }

    updateUI();
}

function handleThemeClick(event: Event) {
    const button = event.currentTarget as HTMLButtonElement;
    const theme = button.getAttribute('data-theme') as ColorTheme;
    
    if (!theme) return;
    
    // Check if theme is implemented
    if (!IMPLEMENTED_THEMES.includes(theme)) {
        toastService.show({
            title: 'Coming Soon',
            text: `The ${theme} theme is not yet implemented. Stay tuned!`,
            severity: ToastSeverity.Normal
        });
        return;
    }
    
    themeService.setColorTheme(theme);
    updateUI();
}

function updateUI() {
    const settings = themeService.getSettings();
    const currentTheme = themeService.getCurrentTheme();
    
    // Update mode slider value
    modeInputElement.value = settings.preference === 'auto'
        ? MODE_TO_VALUE.auto
        : MODE_TO_VALUE[settings.mode];
    modeInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Update theme buttons
    themeButtons.forEach(button => {
        const theme = button.getAttribute('data-theme');
        button.classList.toggle('active', theme === currentTheme.colorTheme);
    });
}
