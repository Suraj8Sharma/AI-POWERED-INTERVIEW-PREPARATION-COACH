/**
 * PrepLoom Theme Manager — Shared across all pages
 * Handles theme switching, persistence, and synchronization
 */

const THEME_STORAGE_KEY = 'pl-theme';

/**
 * Initialize theme from localStorage or system preference
 */
function initializeThemeManager() {
    let theme = localStorage.getItem(THEME_STORAGE_KEY);
    
    // If no saved theme, check system preference
    if (!theme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
    }
    
    applyTheme(theme);
    
    // Listen for storage changes from other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === THEME_STORAGE_KEY && e.newValue) {
            applyTheme(e.newValue);
        }
    });
}

/**
 * Apply theme to the document
 */
function applyTheme(theme) {
    const html = document.documentElement;
    const body = document.querySelector('body');
    
    // Remove both theme classes first
    html.classList.remove('theme-light', 'theme-dark');
    if (body) {
        body.classList.remove('theme-light', 'theme-dark');
    }
    
    // Add the new theme class
    if (theme === 'light') {
        html.classList.add('theme-light');
        if (body) body.classList.add('theme-light');
    } else {
        html.classList.add('theme-dark');
        if (body) body.classList.add('theme-dark');
    }
    
    // Update theme toggle icons
    updateThemeToggleIcons(theme);
    
    // Save to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Update all theme toggle icons on the page
 */
function updateThemeToggleIcons(theme) {
    const icons = document.querySelectorAll('[data-theme-icon]');
    icons.forEach(icon => {
        icon.textContent = theme === 'light' ? '🌙' : '☀️';
    });
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
    const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
}

// Initialize theme immediately to prevent flash
document.addEventListener('DOMContentLoaded', initializeThemeManager);

// Also run it immediately in case DOM is already loaded
if (document.readyState === 'loading') {
    // DOM is still loading
} else {
    // DOM is already ready
    initializeThemeManager();
}
