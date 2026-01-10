/**
 * Color theme palette options
 */
export type ColorTheme = 'blue' | 'red' | 'green' | 'purple' | 'pink' | 'orange' | 'monochrome';

/**
 * Light/dark mode options
 */
export type ThemeMode = 'light' | 'dark';

/**
 * Complete theme configuration
 */
export interface ThemeConfig {
    colorTheme: ColorTheme;
    mode: ThemeMode;
}

/**
 * Theme preference - can be auto (follows OS) or manual
 */
export type ThemePreference = 'auto' | 'manual';

/**
 * User's theme settings stored in localStorage
 */
export interface ThemeSettings {
    colorTheme: ColorTheme;
    mode: ThemeMode;
    preference: ThemePreference; // 'auto' means follow OS, 'manual' means user-selected
}
