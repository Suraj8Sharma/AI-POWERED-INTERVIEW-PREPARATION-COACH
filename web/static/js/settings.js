/**
 * PrepLoom Settings — Preferences, Profile, and Account management
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Preferences Management (Uses PrepLoom from site.js)
// ═══════════════════════════════════════════════════════════════════════════

function populatePreferences() {
    const prefs = typeof PrepLoom !== 'undefined' ? PrepLoom.getPrefs() : JSON.parse(localStorage.getItem('preploom_prefs') || '{}');
    
    const setUIVal = (id, value) => {
        if (value === undefined) return;
        const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el) {
            if (el.type === 'checkbox') el.checked = value === true;
            else if (el.type === 'radio') {
                const radio = document.querySelector(`input[name="${el.name}"][value="${value}"]`);
                if (radio) radio.checked = true;
            } else el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    setUIVal('roleSelect', prefs.defaultRole || 'Software Engineer');
    setUIVal('prefTts', prefs.prefTts !== false);
    setUIVal('prefIdeal', prefs.prefIdeal === true);
    setUIVal('prefCode', prefs.prefCode === true);
    setUIVal('prefAutoPosture', prefs.prefAutoPosture !== false);
    
    setUIVal('prefRes', prefs.prefRes || '720p');
    setUIVal('prefFps', prefs.prefFps || '15 FPS (balanced)');

    const theme = prefs.theme || localStorage.getItem('pl-theme') || 'system';
    setUIVal('theme', theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
    
    const themeOptions = document.querySelectorAll('input[name="theme"]');
    themeOptions.forEach(opt => {
        if (opt.checked) opt.closest('.theme-option').classList.add('active');
        else opt.closest('.theme-option').classList.remove('active');
    });

    setUIVal('accentColor', prefs.accent || '#6c63ff');
    setUIVal('fontSizeRange', prefs.fontSizeRange || '16');
    setUIVal('reduceMotion', prefs.reduceMotion === true);
    setUIVal('prefAmbientOrbs', prefs.prefAmbientOrbs !== false);
    
    const fsVal = document.getElementById('fontSizeRangeVal');
    if (fsVal) fsVal.textContent = prefs.fontSizeRange || '16';
}

function savePreferences(e) {
    if (e) e.preventDefault();
    
    const getVal = (id) => {
        const el = document.getElementById(id);
        if (!el) {
            const checkedRadio = document.querySelector(`input[name="${id}"]:checked`);
            if (checkedRadio) return checkedRadio.value;
            return undefined;
        }
        return el.type === 'checkbox' ? el.checked : el.value;
    };

    const newPrefs = {};
    const role = getVal('roleSelect'); if (role !== undefined) newPrefs.defaultRole = role;
    const tts = getVal('prefTts'); if (tts !== undefined) newPrefs.prefTts = tts;
    const ideal = getVal('prefIdeal'); if (ideal !== undefined) newPrefs.prefIdeal = ideal;
    const code = getVal('prefCode'); if (code !== undefined) newPrefs.prefCode = code;
    const posture = getVal('prefAutoPosture'); if (posture !== undefined) newPrefs.prefAutoPosture = posture;
    
    const res = getVal('prefRes'); if (res !== undefined) newPrefs.prefRes = res;
    const fps = getVal('prefFps'); if (fps !== undefined) newPrefs.prefFps = fps;

    const theme = getVal('theme'); if (theme !== undefined) newPrefs.theme = theme;
    const accent = getVal('accentColor'); if (accent !== undefined) newPrefs.accent = accent;
    const font = getVal('fontSizeRange'); if (font !== undefined) newPrefs.fontSizeRange = font;
    const motion = getVal('reduceMotion'); if (motion !== undefined) newPrefs.reduceMotion = motion;
    const orbs = getVal('prefAmbientOrbs'); if (orbs !== undefined) newPrefs.prefAmbientOrbs = orbs;

    if (typeof PrepLoom !== 'undefined') {
        PrepLoom.setPrefs(newPrefs);
        PrepLoom.applyGlobalPreferences();
    } else {
        const current = JSON.parse(localStorage.getItem('preploom_prefs') || '{}');
        Object.assign(current, newPrefs);
        localStorage.setItem('preploom_prefs', JSON.stringify(current));
    }
    
    const btn = document.getElementById('saveAppearanceBtn');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = "✅ Saved!";
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  User Profile Management
// ═══════════════════════════════════════════════════════════════════════════

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

function showDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function hideDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

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

function handleLogout() {
    localStorage.removeItem('preploom_token');
    window.location.href = '/';
}

// ═══════════════════════════════════════════════════════════════════════════
//  Event Listeners
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    populatePreferences();
    
    const saveAppearanceBtn = document.getElementById('saveAppearanceBtn');
    if (saveAppearanceBtn) saveAppearanceBtn.addEventListener('click', savePreferences);

    const fontSizeRange = document.getElementById('fontSizeRange');
    const fontSizeRangeVal = document.getElementById('fontSizeRangeVal');
    if (fontSizeRange && fontSizeRangeVal) {
        fontSizeRange.addEventListener('input', () => {
            fontSizeRangeVal.textContent = fontSizeRange.value;
        });
    }

    const themeRadios = document.querySelectorAll('input[name="theme"]');
    themeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const options = document.querySelectorAll('.theme-option');
            options.forEach(opt => opt.classList.remove('active'));
            if (radio.checked) radio.closest('.theme-option').classList.add('active');
            if (typeof PrepLoom !== 'undefined') PrepLoom.applyTheme(radio.value);
        });
    });

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const prefs = typeof PrepLoom !== 'undefined' ? PrepLoom.getPrefs() : JSON.parse(localStorage.getItem('preploom_prefs') || '{}');
            const currentTheme = prefs.theme || localStorage.getItem('pl-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            if (typeof PrepLoom !== 'undefined') PrepLoom.applyTheme(newTheme);
            populatePreferences();
        });
    }
    
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }
    
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
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    loadUserProfile();
});
