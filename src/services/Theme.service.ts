import type { ColorTheme, ThemeMode, ThemeSettings, ThemeConfig } from '../types/Theme';

/**
 * Service for managing color themes and light/dark modes
 */
class ThemeService {
    private readonly STORAGE_KEY = 'theme-settings';
    private currentSettings: ThemeSettings;
    private osPrefersDark: MediaQueryList;

    constructor() {
        // Initialize OS dark mode detection
        this.osPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Load saved settings or use defaults
        this.currentSettings = this.loadSettings();
    }

    /**
     * Initialize the theme service - sets up initial theme and listeners
     */
    public initialize(): void {
        console.log('[ThemeService] Initializing theme service');
        
        // Apply the current theme
        this.applyTheme(this.currentSettings.colorTheme, this.getEffectiveMode());
        
        // Listen for OS theme changes if preference is auto
        this.osPrefersDark.addEventListener('change', (e) => {
            if (this.currentSettings.preference === 'auto') {
                const mode = e.matches ? 'dark' : 'light';
                this.applyTheme(this.currentSettings.colorTheme, mode);
            }
        });

        console.log('[ThemeService] Theme service initialized', this.currentSettings);
    }

    /**
     * Get the current theme configuration
     */
    public getCurrentTheme(): ThemeConfig {
        return {
            colorTheme: this.currentSettings.colorTheme,
            mode: this.getEffectiveMode()
        };
    }

    /**
     * Get the current theme settings (includes preference)
     */
    public getSettings(): ThemeSettings {
        return { ...this.currentSettings };
    }

    /**
     * Set the color theme (blue, red, etc.)
     */
    public setColorTheme(theme: ColorTheme): void {
        console.log(`[ThemeService] Setting color theme to: ${theme}`);
        this.currentSettings.colorTheme = theme;
        this.saveSettings();
        this.applyTheme(theme, this.getEffectiveMode());
    }

    /**
     * Set the mode (light, dark, or auto)
     */
    public setMode(mode: ThemeMode, preference: 'auto' | 'manual' = 'manual'): void {
        console.log(`[ThemeService] Setting mode to: ${mode} (preference: ${preference})`);
        this.currentSettings.mode = mode;
        this.currentSettings.preference = preference;
        this.saveSettings();
        this.applyTheme(this.currentSettings.colorTheme, this.getEffectiveMode());
    }

    /**
     * Toggle between light and dark mode (sets preference to manual)
     */
    public toggleMode(): void {
        const currentMode = this.getEffectiveMode();
        const newMode = currentMode === 'light' ? 'dark' : 'light';
        this.setMode(newMode, 'manual');
    }

    /**
     * Reset to auto mode (follow OS preference)
     */
    public setAutoMode(): void {
        console.log('[ThemeService] Setting mode to auto');
        this.currentSettings.preference = 'auto';
        this.saveSettings();
        this.applyTheme(this.currentSettings.colorTheme, this.getEffectiveMode());
    }

    /**
     * Get the effective mode (resolves 'auto' to actual light/dark based on OS)
     */
    private getEffectiveMode(): ThemeMode {
        if (this.currentSettings.preference === 'auto') {
            return this.osPrefersDark.matches ? 'dark' : 'light';
        }
        return this.currentSettings.mode;
    }

    /**
     * Apply the theme to the document
     */
    private applyTheme(colorTheme: ColorTheme, mode: ThemeMode): void {
        console.log(`[ThemeService] Applying theme: ${colorTheme}-${mode}`);
        
        const html = document.documentElement;
        
        // Set data attributes for CSS targeting
        html.setAttribute('data-theme', colorTheme);
        html.setAttribute('data-mode', mode);
        
        // Update highlight.js theme
        this.updateHighlightTheme(mode);
    }

    /**
     * Update the highlight.js theme based on mode
     */
    private updateHighlightTheme(mode: ThemeMode): void {
        const existingLink = document.querySelector('link[data-highlight-theme]');
        
        if (existingLink) {
            const newHref = mode === 'dark' 
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
            
            existingLink.setAttribute('href', newHref);
        }
    }

    /**
     * Load settings from localStorage
     */
    private loadSettings(): ThemeSettings {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const settings = JSON.parse(stored) as ThemeSettings;
                // Validate the settings
                if (this.isValidSettings(settings)) {
                    return settings;
                }
            }
        } catch (error) {
            console.error('[ThemeService] Error loading settings:', error);
        }

        // Return defaults
        return {
            colorTheme: 'blue',
            mode: this.osPrefersDark.matches ? 'dark' : 'light',
            preference: 'auto'
        };
    }

    /**
     * Save settings to localStorage
     */
    private saveSettings(): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentSettings));
        } catch (error) {
            console.error('[ThemeService] Error saving settings:', error);
        }
    }

    /**
     * Validate theme settings object
     */
    private isValidSettings(settings: unknown): settings is ThemeSettings {
        if (!settings || typeof settings !== 'object') {
            return false;
        }

        const s = settings as Record<string, unknown>;
        
        const validColorThemes: ColorTheme[] = ['blue', 'red', 'green', 'purple', 'pink', 'orange', 'monochrome'];
        
        return (
            validColorThemes.includes(s.colorTheme as ColorTheme) &&
            (s.mode === 'light' || s.mode === 'dark') &&
            (s.preference === 'auto' || s.preference === 'manual')
        );
    }
}

// Export singleton instance
export const themeService = new ThemeService();
