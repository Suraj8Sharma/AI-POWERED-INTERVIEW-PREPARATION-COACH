/**
 * PrepLoom auth UI.
 *
 * Uses Supabase when available and falls back to the legacy local auth API.
 */
(function () {
    // Global visual preferences applier
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
    
    // Instantly sync if OS/System level scheme changes or cross-tab settings update
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

    var TOKEN_KEY = "preploom_token";

    function hasSupabase() {
        return !!(window.SB && window.SB.client);
    }

    function getToken() {
        try {
            if (hasSupabase() && typeof window.SB.getToken === "function") {
                return window.SB.getToken();
            }
            return localStorage.getItem(TOKEN_KEY);
        } catch (e) {
            return null;
        }
    }

    function setToken(token) {
        try {
            if (token) localStorage.setItem(TOKEN_KEY, token);
            else localStorage.removeItem(TOKEN_KEY);
        } catch (e) {
            return null;
        }
        return token;
    }

    function clearToken() {
        setToken(null);
    }

    function showEl(el, show) {
        if (!el) return;
        if (show) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
    }

    function setButtonBusy(btn, busy) {
        if (!btn) return function () {};
        var prev = btn.textContent;
        btn.disabled = !!busy;
        if (busy) btn.textContent = "...";
        return function () {
            btn.disabled = false;
            btn.textContent = prev;
        };
    }

    function setError(errId, message) {
        var errEl = document.getElementById(errId);
        if (!errEl) return;
        errEl.textContent = message || "";
        showEl(errEl, !!message);
    }

    function normalizeAuthError(message, mode) {
        var text = String(message || "").trim();
        if (!text) return text;

        if (mode === "signin" && /invalid login credentials/i.test(text)) {
            return "Invalid login credentials. If this account was created with Google, use Continue with Google.";
        }

        return text;
    }

    function closeModalById(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
        if (el.style) {
            el.style.opacity = "0";
            el.style.visibility = "hidden";
        }
        var inner = el.querySelector("div");
        if (inner && inner.style && inner.style.transform !== undefined) {
            inner.style.transform = "scale(0.96) translateY(8px)";
        }
        document.body.style.overflow = "";
    }

    async function parseLegacyError(res) {
        var j = await res.json().catch(function () {
            return {};
        });
        var d = j.detail;
        if (typeof d === "string") return d;
        if (Array.isArray(d)) {
            return d.map(function (x) {
                return x.msg || JSON.stringify(x);
            }).join(" ");
        }
        return res.statusText || "Request failed";
    }

    async function getSupabaseUser() {
        if (!hasSupabase()) return null;
        var sessionData = await window.SB.client.auth.getSession();
        var session = sessionData && sessionData.data ? sessionData.data.session : null;
        if (!session || !session.user) {
            clearToken();
            return null;
        }
        setToken(session.access_token || "");
        return session.user;
    }

    async function syncSupabaseProfile(user) {
        if (!hasSupabase() || !user || typeof window.SB.syncProfile !== "function") return;
        try {
            await window.SB.syncProfile(user);
        } catch (e) {
            console.warn("Supabase profile sync failed:", e);
        }
    }

    async function getCurrentUser() {
        if (hasSupabase()) {
            return getSupabaseUser();
        }
        var t = getToken();
        if (!t) return null;
        var res = await fetch("/api/auth/me", {
            headers: { Authorization: "Bearer " + t },
        });
        if (!res.ok) {
            clearToken();
            return null;
        }
        return res.json();
    }

    async function refreshMarketingNav() {
        var navBtns = document.getElementById("navAuthButtons");
        var emailEl = document.getElementById("navUserEmail");
        var logoutBtn = document.getElementById("navLogout");
        if (!navBtns || !emailEl || !logoutBtn) return;

        try {
            var user = await getCurrentUser();
            if (user && user.email) {
                await syncSupabaseProfile(user);
                navBtns.setAttribute("hidden", "");
                
                var meta = user.user_metadata || {};
                var displayName = meta.name || meta.full_name || user.name || user.email.split('@')[0];
                displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                emailEl.innerHTML = 'Hi, ' + displayName + ' <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:6px; margin-top:-2px; vertical-align:middle;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
                
                emailEl.classList.remove("hidden");
                logoutBtn.classList.remove("hidden");
                return;
            }
        } catch (e) {
            clearToken();
        }

        navBtns.removeAttribute("hidden");
        emailEl.classList.add("hidden");
        logoutBtn.classList.add("hidden");
    }

    async function refreshAppHint() {
        var hint = document.getElementById("appAuthHint");
        var candName = document.getElementById("candidateName");
        try {
            var user = await getCurrentUser();
            if (user && user.email) {
                await syncSupabaseProfile(user);
                var meta = user.user_metadata || {};
                var displayName = meta.name || meta.full_name || user.name || user.email.split('@')[0];
                displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                if (hint) hint.innerHTML = 'Signed in as <strong>' + displayName + '</strong>.';
                if (candName && !candName.value) candName.value = displayName;
                return;
            }
        } catch (e) {
            clearToken();
        }
        if (hint) hint.innerHTML = '<a href="/">Sign in</a> to link practice sessions to your account (optional).';
    }

    async function refreshAuthUI() {
        await refreshMarketingNav();
        await refreshAppHint();
    }

    async function signOut() {
        if (hasSupabase()) {
            await window.SB.client.auth.signOut();
        }
        clearToken();
        await refreshAuthUI();
    }

    function wireLogout() {
        var logoutBtn = document.getElementById("navLogout");
        if (!logoutBtn) return;
        logoutBtn.addEventListener("click", function () {
            signOut().catch(function () {
                clearToken();
                refreshAuthUI();
            });
        });
    }

    function wireGoogleButtons() {
        document.querySelectorAll("[data-auth-provider='google']").forEach(function (btn) {
            if (btn.dataset.authBound === "true") return;
            btn.dataset.authBound = "true";
            btn.addEventListener("click", async function () {
                if (!hasSupabase()) {
                    setError(btn.getAttribute("data-error-target"), "Supabase is not configured yet.");
                    return;
                }
                var restore = setButtonBusy(btn, true);
                setError(btn.getAttribute("data-error-target"), "");
                try {
                    await window.SB.signInWithGoogle();
                } catch (e) {
                    restore();
                    setError(btn.getAttribute("data-error-target"), e.message || String(e));
                }
            });
        });
    }

    function wireForm(formId, mode, legacyEndpoint, extraBody, errId) {
        var form = document.getElementById(formId);
        if (!form || form.dataset.authBound === "true") return;
        form.dataset.authBound = "true";

        form.addEventListener("submit", async function (ev) {
            ev.preventDefault();
            setError(errId, "");
            var fd = new FormData(form);
            var email = String(fd.get("email") || "").trim();
            var password = String(fd.get("password") || "");
            var btn = form.querySelector('[type="submit"]');
            var restore = setButtonBusy(btn, true);

            try {
                if (hasSupabase()) {
                    if (mode === "signup") {
                        var name = String(fd.get("name") || "").trim();
                        var data = await window.SB.signUpWithEmail(name, email, password);
                        var session = data && data.session;
                        if (session && session.access_token) {
                            setToken(session.access_token);
                        }
                        var needsEmailConfirmation = !session;
                        if (needsEmailConfirmation) {
                            var errEl = document.getElementById(errId);
                            if (errEl) { 
                                errEl.textContent = "✅ Success! Check your email to confirm your account."; 
                                errEl.removeAttribute("hidden"); 
                                errEl.style.color = "#22c55e"; 
                            }
                            return; // Keep modal open so they see the message
                        } else {
                            form.reset();
                        }
                        closeModalById("modal-signup");
                        closeModalById("modal-signin");
                        await refreshAuthUI();
                        return;
                    }

                    var signInData = await window.SB.signInWithEmail(email, password);
                    var signInSession = signInData && signInData.session;
                    setToken(signInSession && signInSession.access_token ? signInSession.access_token : "");
                    closeModalById("modal-signin");
                    closeModalById("modal-signup");
                    form.reset();
                    await refreshAuthUI();
                    return;
                }

                var body = { email: fd.get("email"), password: fd.get("password") };
                if (extraBody) Object.assign(body, extraBody(fd));
                var res = await fetch(legacyEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(await parseLegacyError(res));
                var data = await res.json();
                if (data.access_token) setToken(data.access_token);
                closeModalById("modal-signin");
                closeModalById("modal-signup");
                form.reset();
                await refreshAuthUI();
            } catch (e) {
                setError(errId, normalizeAuthError(e.message || String(e), mode));
            } finally {
                restore();
            }
        });
    }

    function initMarketingAuth() {
        wireLogout();
        wireGoogleButtons();
        wireForm("formSignin", "signin", "/api/auth/login", null, "signinError");
        wireForm("formSignup", "signup", "/api/auth/register", function (fd) {
            var n = fd.get("name");
            return n && String(n).trim() ? { name: String(n).trim() } : {};
        }, "signupError");
    }

    function initSupabaseSessionSync() {
        if (!hasSupabase() || window.__preploomSupabaseSyncBound) return;
        window.__preploomSupabaseSyncBound = true;
        window.SB.client.auth.onAuthStateChange(async function (_event, session) {
            setToken(session && session.access_token ? session.access_token : "");
            if (session && session.user) {
                await syncSupabaseProfile(session.user);
            }
            refreshAuthUI();
        });
    }

    window.PrepLoomAuth = {
        TOKEN_KEY: TOKEN_KEY,
        getToken: getToken,
        setToken: setToken,
        clearToken: clearToken,
        refreshMarketingNav: refreshMarketingNav,
        refreshAuthUI: refreshAuthUI,
    };

    document.addEventListener("DOMContentLoaded", function () {
        initMarketingAuth();
        initSupabaseSessionSync();
        refreshAuthUI();
    });

    window.addEventListener("supabase:ready", function () {
        initSupabaseSessionSync();
        refreshAuthUI();
    });
})();
