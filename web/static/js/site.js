/**
 * PrepLoom — marketing pages: auth modals (UI only).
 */
(function () {
    // Global visual preferences applier for marketing pages
    function applyGlobalPreferences() {
        var prefs = {};
        try {
            var stored = localStorage.getItem('preploom_prefs');
            if (stored) prefs = JSON.parse(stored);
        } catch (e) {
            console.warn('PrepLoom: Could not parse preferences', e);
        }

        var theme = 'system';
        try {
            theme = (localStorage.getItem('preploom_theme') || prefs.theme || 'system').toLowerCase();
        } catch(e) {}

        function applyTheme(t) {
            var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            var applied = isDark ? 'dark' : 'light';
            
            document.documentElement.setAttribute('data-theme', applied);
            if (isDark) {
                document.documentElement.classList.add('dark');
                if (document.body) document.body.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
                if (document.body) document.body.classList.remove('dark');
            }
        }
        
        applyTheme(theme);

        try {
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

            if (prefs.accent) {
                var color = prefs.accent;
                document.documentElement.style.setProperty('--accent', color);
                document.documentElement.style.setProperty('--primary', color);
                document.documentElement.style.setProperty('--accent-2', lightenHex(color, 20));
                document.documentElement.style.setProperty('--accent-glow', hexToRgba(color, 0.25));
                document.documentElement.style.setProperty('--accent-soft', hexToRgba(color, 0.12));
                document.documentElement.style.setProperty('--accent-text', lightenHex(color, 30));
            }
            if (prefs.fontSizeRange) {
                document.documentElement.style.fontSize = prefs.fontSizeRange + 'px';
            }
        } catch(e) { console.warn('PrepLoom: Error applying styles', e); }
    }
    
    applyGlobalPreferences();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyGlobalPreferences);
    window.addEventListener('storage', function(e) {
        if (e.key === 'preploom_prefs' || e.key === 'preploom_theme') applyGlobalPreferences();
    });
    document.addEventListener("DOMContentLoaded", applyGlobalPreferences);
    
    if (typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function() {
            if (document.body) {
                applyGlobalPreferences();
                observer.disconnect();
            }
        });
        if (!document.body) observer.observe(document.documentElement, { childList: true });
    }

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

    document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-open-modal');
            if (id) openModal(id);
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal(overlay);
        });
    });

    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var overlay = btn.closest('.modal-overlay');
            closeModal(overlay);
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.modal-overlay.is-open').forEach(closeModal);
    });
})();
