import { themeService } from '../../services/Theme.service';
import type { ColorTheme } from '../../models/Theme';
import * as toastService from '../../services/Toast.service';
import { ToastSeverity } from '../../models/Toast';

// Query all required elements
const modeButtons = document.querySelectorAll<HTMLButtonElement>('.mode-btn');
const themeButtons = document.querySelectorAll<HTMLButtonElement>('.theme-btn');

if (!modeButtons.length || !themeButtons.length) {
    console.error('Theme control elements not found in DOM');
    throw new Error('Theme control elements not found');
}

// Implemented themes (others are placeholders)
const IMPLEMENTED_THEMES: ColorTheme[] = ['blue', 'red'];

function initialize() {
    console.log('[ThemeControls] Initializing theme controls');
    
    // Set up mode buttons
    modeButtons.forEach(button => {
        button.addEventListener('click', handleModeClick);
    });
    
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

function handleModeClick(event: Event) {
    const button = event.currentTarget as HTMLButtonElement;
    const mode = button.getAttribute('data-mode');
    
    if (!mode) return;
    
    if (mode === 'auto') {
        themeService.setAutoMode();
    } else if (mode === 'light' || mode === 'dark') {
        themeService.setMode(mode, 'manual');
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
    
    // Update mode buttons
    modeButtons.forEach(button => {
        const mode = button.getAttribute('data-mode');
        
        if (mode === 'auto') {
            button.classList.toggle('active', settings.preference === 'auto');
        } else {
            button.classList.toggle('active', 
                settings.preference === 'manual' && settings.mode === mode
            );
        }
    });
    
    // Update theme buttons
    themeButtons.forEach(button => {
        const theme = button.getAttribute('data-theme');
        button.classList.toggle('active', theme === currentTheme.colorTheme);
    });
}
