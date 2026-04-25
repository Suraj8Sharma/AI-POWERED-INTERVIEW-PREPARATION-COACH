/**
 * PrepLoom auth UI.
 *
 * Uses Supabase when available and falls back to the legacy local auth API.
 */
(function () {
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
                emailEl.textContent = user.email;
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
        if (!hint) return;
        try {
            var user = await getCurrentUser();
            if (user && user.email) {
                await syncSupabaseProfile(user);
                hint.textContent = "Signed in as " + user.email;
                return;
            }
        } catch (e) {
            clearToken();
        }
        hint.innerHTML = '<a href="/">Sign in</a> to link practice sessions to your account (optional).';
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
                        closeModalById("modal-signup");
                        closeModalById("modal-signin");
                        await refreshAuthUI();
                        if (needsEmailConfirmation) {
                            setError(errId, "Check your email to confirm your account, then sign in.");
                        } else {
                            form.reset();
                        }
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
