/**
 * PrepLoom Settings — Theme management and profile settings
 *
 * Handles:
 *  - Theme switching (dark/light) with localStorage persistence
 *  - Profile updates (name)
 *  - Account deletion
 *  - Cross-page theme synchronization
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Theme Management
// ═══════════════════════════════════════════════════════════════════════════

const THEME_STORAGE_KEY = 'pl-theme';
const PROFILE_STORAGE_KEY = 'pl-profile';

/**
 * Initialize theme from localStorage or system preference
 */
function initializeTheme() {
    let theme = localStorage.getItem(THEME_STORAGE_KEY);
    
    // If no saved theme, check system preference
    if (!theme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
    }
    
    applyTheme(theme);
}

/**
 * Apply theme to the document and save to localStorage
 */
function applyTheme(theme) {
    const html = document.documentElement;
    const body = document.querySelector('body');
    
    if (theme === 'light') {
        html.classList.add('theme-light');
        html.classList.remove('theme-dark');
        if (body) {
            body.classList.add('theme-light');
            body.classList.remove('theme-dark');
        }
    } else {
        html.classList.remove('theme-light');
        html.classList.add('theme-dark');
        if (body) {
            body.classList.remove('theme-light');
            body.classList.add('theme-dark');
        }
    }
    
    // Update the theme toggle icon in navigation
    updateThemeToggleIcon(theme);
    
    // Save to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    
    // Broadcast to other tabs
    broadcastThemeChange(theme);
}

/**
 * Update theme toggle icon
 */
function updateThemeToggleIcon(theme) {
    const icon = document.getElementById('themeIconNav');
    if (icon) {
        icon.textContent = theme === 'light' ? '🌙' : '☀️';
    }
}

/**
 * Broadcast theme change to other tabs via localStorage
 */
function broadcastThemeChange(theme) {
    const timestamp = Date.now();
    localStorage.setItem('pl-theme-broadcast', JSON.stringify({ theme, timestamp }));
}

/**
 * Listen for theme changes from other tabs
 */
function initializeThemeSync() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'pl-theme-broadcast' && e.newValue) {
            try {
                const { theme } = JSON.parse(e.newValue);
                applyTheme(theme);
                updateThemeRadios(theme);
            } catch (err) {
                console.error('Error syncing theme:', err);
            }
        }
    });
}

/**
 * Update radio buttons to match current theme
 */
function updateThemeRadios(theme) {
    const themeDark = document.getElementById('themeDark');
    const themeLight = document.getElementById('themeLight');
    
    if (themeDark && themeLight) {
        if (theme === 'dark') {
            themeDark.checked = true;
        } else {
            themeLight.checked = true;
        }
    }
    
    // Update visual active state
    updateThemeOptionVisuals(theme);
}

/**
 * Update theme option visual state
 */
function updateThemeOptionVisuals(theme) {
    const options = document.querySelectorAll('.theme-option');
    options.forEach(option => {
        option.classList.remove('active');
    });
    
    if (theme === 'dark') {
        options[0]?.classList.add('active');
    } else {
        options[1]?.classList.add('active');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  User Profile Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load user profile and populate form
 */
async function loadUserProfile() {
    try {
        const token = localStorage.getItem('preploom_token');
        if (!token) {
            window.location.href = '/';
            return;
        }

        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('preploom_token');
                window.location.href = '/';
            }
            throw new Error('Failed to load profile');
        }
        
        const user = await response.json();
        populateProfileForm(user);
    } catch (error) {
        console.error('Error loading profile:', error);
        showStatus('profileStatus', 'Error loading profile', 'error');
    }
}

/**
 * Populate form with user data
 */
function populateProfileForm(user) {
    const nameInput = document.getElementById('nameInput');
    const emailDisplay = document.getElementById('emailDisplay');
    
    if (nameInput) {
        nameInput.value = user.user_metadata?.name || user.name || '';
    }
    
    if (emailDisplay) {
        emailDisplay.textContent = user.email || 'Not available';
    }
}

/**
 * Save profile updates
 */
async function saveProfile() {
    try {
        const token = localStorage.getItem('preploom_token');
        const nameInput = document.getElementById('nameInput');
        
        if (!token || !nameInput) return;
        
        const name = nameInput.value.trim();
        
        if (!name) {
            showStatus('profileStatus', 'Please enter your name', 'error');
            return;
        }
        
        const saveBtn = document.getElementById('saveProfileBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        const response = await fetch('/api/auth/update-profile', {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update profile');
        }
        
        showStatus('profileStatus', 'Profile updated successfully!', 'success');
        saveBtn.textContent = 'Save Profile';
        saveBtn.disabled = false;
    } catch (error) {
        console.error('Error saving profile:', error);
        showStatus('profileStatus', 'Error updating profile', 'error');
        const saveBtn = document.getElementById('saveProfileBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Save Profile';
            saveBtn.disabled = false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Account Deletion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Show delete account confirmation modal
 */
function showDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.add('show');
    }
}

/**
 * Hide delete account modal
 */
function hideDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * Delete user account
 */
async function deleteAccount() {
    try {
        const token = localStorage.getItem('preploom_token');

        if (!token) {
            window.location.href = '/';
            return;
        }

        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';

        const response = await fetch('/api/auth/delete-account', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete account');
        }

        // Clear auth token and redirect
        localStorage.removeItem('preploom_token');
        window.location.href = '/?account_deleted=true';
    } catch (error) {
        console.error('Error deleting account:', error);
        showStatus('securityStatus', 'Error deleting account. Please try again.', 'error');
        
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete Everything';
        
        hideDeleteModal();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Show status message
 */
function showStatus(elementId, message, type = 'success') {
    const statusEl = document.getElementById(elementId);
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message show ${type}`;
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        statusEl.classList.remove('show');
    }, 4000);
}

/**
 * Handle logout
 */
function handleLogout() {
    localStorage.removeItem('preploom_token');
    window.location.href = '/';
}

// ═══════════════════════════════════════════════════════════════════════════
//  Event Listeners
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    initializeTheme();
    initializeThemeSync();
    
    // Theme switching
    const themeDark = document.getElementById('themeDark');
    const themeLight = document.getElementById('themeLight');
    const themeToggleNav = document.getElementById('themeToggleNav');
    
    if (themeDark) {
        themeDark.addEventListener('change', () => {
            applyTheme('dark');
            updateThemeOptionVisuals('dark');
        });
    }
    
    if (themeLight) {
        themeLight.addEventListener('change', () => {
            applyTheme('light');
            updateThemeOptionVisuals('light');
        });
    }
    
    if (themeToggleNav) {
        themeToggleNav.addEventListener('click', () => {
            const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
            updateThemeRadios(newTheme);
        });
    }
    
    // Profile management
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }
    
    // Account deletion
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', showDeleteModal);
    }
    
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    }
    
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteAccount);
    }
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Load user profile
    loadUserProfile();
    
    // Initialize theme radios to current theme
    const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    updateThemeRadios(currentTheme);
});
