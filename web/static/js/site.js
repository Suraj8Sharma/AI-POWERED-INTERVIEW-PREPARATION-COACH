/**
 * PrepLoom — global preferences applier (marketing + app pages).
 */
const PrepLoom = (function () {
    const PREFS_KEY = 'preploom_prefs';
    const THEME_KEY = 'pl-theme';

    function getPrefs() {
        try {
            var stored = localStorage.getItem(PREFS_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return {};
    }

    function setPrefs(newPrefs) {
        try {
            var current = getPrefs();
            var merged = Object.assign({}, current, newPrefs);
            localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
            return merged;
        } catch (e) {
            return newPrefs;
        }
    }

    function lightenHex(hex, pct) {
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
        if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
        var li = function(v) { return Math.min(255, Math.floor(v + (255 - v) * pct/100)); };
        return '#' + [li(r),li(g),li(b)].map(function(v) { return v.toString(16).padStart(2,'0'); }).join('');
    }

    function hexToRgba(hex, alpha) {
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
        if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function updateThemeToggleIcons(theme) {
        var icons = document.querySelectorAll('[data-theme-icon]');
        var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        icons.forEach(function(icon) {
            icon.textContent = isDark ? '☀️' : '🌙';
        });
    }

    function applyTheme(theme) {
        var t = (theme || 'system').toLowerCase();
        var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        var applied = isDark ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', applied);
        document.documentElement.classList.toggle('theme-dark', isDark);
        document.documentElement.classList.toggle('theme-light', !isDark);
        if (document.body) {
            document.body.classList.toggle('theme-dark', isDark);
            document.body.classList.toggle('theme-light', !isDark);
        }
        
        updateThemeToggleIcons(t);
        
        // Save compatibility keys
        localStorage.setItem(THEME_KEY, applied);
        
        // Save the raw preference
        if (theme) {
            var prefs = getPrefs();
            if (prefs.theme !== theme) {
                setPrefs({ theme: theme });
            }
        }
    }

    function toggleTheme() {
        var prefs = getPrefs();
        var current = prefs.theme || localStorage.getItem(THEME_KEY) || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
    }

    function applyAccent(color) {
        if (!color) return;
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--primary', color);
        document.documentElement.style.setProperty('--accent-2', lightenHex(color, 20));
        document.documentElement.style.setProperty('--accent-glow', hexToRgba(color, 0.25));
        document.documentElement.style.setProperty('--accent-soft', hexToRgba(color, 0.12));
        document.documentElement.style.setProperty('--accent-text', lightenHex(color, 30));
    }

    function applyFontSize(size) {
        if (size) {
            document.documentElement.style.fontSize = size + 'px';
        } else {
            document.documentElement.style.fontSize = '';
        }
    }

    function applyReduceMotion(enabled) {
        var existing = document.getElementById('reduce-motion-style');
        if (enabled) {
            document.documentElement.style.setProperty('--transition-theme', '0s');
            if (!existing) {
                var style = document.createElement('style');
                style.id = 'reduce-motion-style';
                style.textContent = '*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; animation-iteration-count: 1 !important; }';
                document.head.appendChild(style);
            }
        } else {
            document.documentElement.style.setProperty('--transition-theme', '0.35s cubic-bezier(0.4, 0, 0.2, 1)');
            if (existing) existing.remove();
        }
    }

    function applyAmbientOrbs(enabled) {
        var orbs = document.querySelector('.ambient');
        if (orbs) {
            orbs.style.display = (enabled === false) ? 'none' : 'block';
            orbs.style.opacity = (enabled === false) ? '0' : '1';
        }
    }

    function applyGlobalPreferences() {
        var prefs = getPrefs();
        var theme = prefs.theme || 'system';
        applyTheme(theme);
        applyAccent(prefs.accent);
        applyFontSize(prefs.fontSizeRange);
        applyReduceMotion(prefs.reduceMotion);
        applyAmbientOrbs(prefs.prefAmbientOrbs);
    }

    // Initial application
    applyGlobalPreferences();

    // Listeners
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        if ((getPrefs().theme || 'system') === 'system') {
            applyGlobalPreferences();
        }
    });

    window.addEventListener('storage', function(e) {
        if (e.key === PREFS_KEY || e.key === THEME_KEY || e.key === 'preploom_theme') applyGlobalPreferences();
    });

    document.addEventListener("DOMContentLoaded", applyGlobalPreferences);

    // Exported API
    return {
        getPrefs: getPrefs,
        setPrefs: setPrefs,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        applyAccent: applyAccent,
        applyFontSize: applyFontSize,
        applyReduceMotion: applyReduceMotion,
        applyAmbientOrbs: applyAmbientOrbs,
        applyGlobalPreferences: applyGlobalPreferences
    };
})();

// Modal helpers
(function () {
    function openModal(id) {
        document.querySelectorAll('.modal-overlay.is-open').forEach(function (o) {
            closeModal(o);
        });
        var el = document.getElementById(id);
        if (el) {
            el.classList.add('is-open');
            el.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(el) {
        if (el && el.classList.contains('modal-overlay')) {
            el.classList.remove('is-open');
            el.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    }

    document.addEventListener('click', function(e) {
        var openBtn = e.target.closest('[data-open-modal]');
        if (openBtn) {
            openModal(openBtn.getAttribute('data-open-modal'));
            return;
        }

        var closeBtn = e.target.closest('[data-close-modal]');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay'));
            return;
        }

        if (e.target.classList.contains('modal-overlay')) {
            closeModal(e.target);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.modal-overlay.is-open').forEach(closeModal);
    });
})();

// Global compatibility function
function toggleTheme() {
    if (typeof PrepLoom !== 'undefined') {
        PrepLoom.toggleTheme();
    }
}
