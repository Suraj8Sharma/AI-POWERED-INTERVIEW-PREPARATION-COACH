/**
 * PrepLoom — sign-in / sign-up (MongoDB + JWT) and nav state on marketing pages.
 */
(function () {
    var TOKEN_KEY = "preploom_token";

    function getToken() {
        try {
            return localStorage.getItem(TOKEN_KEY);
        } catch (e) {
            return null;
        }
    }

    function setToken(t) {
        localStorage.setItem(TOKEN_KEY, t);
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    async function parseError(res) {
        var j = await res.json().catch(function () {
            return {};
        });
        var d = j.detail;
        if (typeof d === "string") return d;
        if (Array.isArray(d))
            return d
                .map(function (x) {
                    return x.msg || JSON.stringify(x);
                })
                .join(" ");
        return res.statusText || "Request failed";
    }

    function showEl(el, show) {
        if (!el) return;
        if (show) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
    }

    function refreshMarketingNav() {
        var navBtns = document.getElementById("navAuthButtons");
        var emailEl = document.getElementById("navUserEmail");
        var logoutBtn = document.getElementById("navLogout");
        var t = getToken();
        if (!navBtns || !emailEl || !logoutBtn) return;

        if (t) {
            fetch("/api/auth/me", { headers: { Authorization: "Bearer " + t } })
                .then(function (r) {
                    if (!r.ok) throw new Error();
                    return r.json();
                })
                .then(function (u) {
                    navBtns.setAttribute("hidden", "");
                    emailEl.textContent = u.email || "";
                    emailEl.classList.remove("hidden");
                    logoutBtn.classList.remove("hidden");
                })
                .catch(function () {
                    clearToken();
                    navBtns.removeAttribute("hidden");
                    emailEl.classList.add("hidden");
                    logoutBtn.classList.add("hidden");
                });
        } else {
            navBtns.removeAttribute("hidden");
            emailEl.classList.add("hidden");
            logoutBtn.classList.add("hidden");
        }
    }

    function wireLogout() {
        var logoutBtn = document.getElementById("navLogout");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function () {
                clearToken();
                refreshMarketingNav();
            });
        }
    }

    function closeModalById(id) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.remove("is-open");
            el.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
        }
    }

    function wireForm(formId, endpoint, extraBody, errId) {
        var form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener("submit", async function (ev) {
            ev.preventDefault();
            var errEl = document.getElementById(errId);
            if (errEl) {
                errEl.textContent = "";
                showEl(errEl, false);
            }
            var fd = new FormData(form);
            var body = { email: fd.get("email"), password: fd.get("password") };
            if (extraBody) Object.assign(body, extraBody(fd));
            var btn = form.querySelector('[type="submit"]');
            if (btn) {
                btn.disabled = true;
                var prev = btn.textContent;
                btn.textContent = "…";
            }
            try {
                var res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(await parseError(res));
                var data = await res.json();
                if (data.access_token) setToken(data.access_token);
                closeModalById("modal-signin");
                closeModalById("modal-signup");
                refreshMarketingNav();
            } catch (e) {
                if (errEl) {
                    errEl.textContent = e.message || String(e);
                    showEl(errEl, true);
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = prev;
                }
            }
        });
    }

    function initMarketingAuth() {
        if (!document.getElementById("navAuthButtons")) return;
        wireLogout();
        refreshMarketingNav();
        wireForm("formSignin", "/api/auth/login", null, "signinError");
        wireForm("formSignup", "/api/auth/register", function (fd) {
            var n = fd.get("name");
            return n && String(n).trim() ? { name: String(n).trim() } : {};
        }, "signupError");
    }

    function initAppAuth() {
        var hint = document.getElementById("appAuthHint");
        if (!hint) return;
        var t = getToken();
        if (!t) {
            hint.innerHTML =
                '<a href="/">Sign in</a> to link practice sessions to your account (optional).';
            return;
        }
        fetch("/api/auth/me", { headers: { Authorization: "Bearer " + t } })
            .then(function (r) {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then(function (u) {
                hint.textContent = "Signed in as " + (u.email || "user");
            })
            .catch(function () {
                hint.innerHTML =
                    '<a href="/">Session expired — sign in again</a>';
                clearToken();
            });
    }

    window.PrepLoomAuth = {
        TOKEN_KEY: TOKEN_KEY,
        getToken: getToken,
        setToken: setToken,
        clearToken: clearToken,
        refreshMarketingNav: refreshMarketingNav,
    };

    document.addEventListener("DOMContentLoaded", function () {
        initMarketingAuth();
        initAppAuth();
    });
})();
