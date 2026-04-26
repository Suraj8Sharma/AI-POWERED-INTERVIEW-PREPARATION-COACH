/**
 * PrepLoom — Premium Auth Experience
 * Drop-in upgrade over auth.js
 *
 * Features:
 *  • Instant navbar user-profile swap with personalized greeting + dropdown
 *  • Morphing Sign-In ↔ Sign-Up card (no hard refresh, CSS height animation)
 *  • Staggered field entry animations
 *  • Button hover-scale + 1-second success pulse/checkmark before UI commit
 *  • Zero external dependencies — pure CSS + Web Animations API
 */
(function () {
    /* ─────────────────────────────────────────────
       CONSTANTS
    ───────────────────────────────────────────── */
    var TOKEN_KEY  = "preploom_token";
    var NAME_KEY   = "preploom_display_name";
    var EMAIL_KEY  = "preploom_display_email";

    /* ─────────────────────────────────────────────
       INJECT PREMIUM STYLES
    ───────────────────────────────────────────── */
    (function injectStyles() {
        var s = document.createElement("style");
        s.textContent = /* css */`

/* ── Navbar profile slot ─────────────────────────────────── */
.nav-profile {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0;
    cursor: pointer;
    outline: none;
}

.nav-profile__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.38rem 0.75rem 0.38rem 0.45rem;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
    color: #f4f4f7;
    font-size: 0.84rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.18s, border-color 0.18s, transform 0.18s;
    white-space: nowrap;
}

.nav-profile__btn:hover {
    background: rgba(108,99,255,0.12);
    border-color: rgba(108,99,255,0.35);
    transform: translateY(-1px);
}

.nav-profile__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6c63ff, #2dd4bf);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 800;
    color: #fff;
    flex-shrink: 0;
    letter-spacing: 0.01em;
    box-shadow: 0 2px 10px rgba(108,99,255,0.35);
}

.nav-profile__caret {
    width: 14px;
    height: 14px;
    opacity: 0.55;
    transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
    flex-shrink: 0;
}

.nav-profile.open .nav-profile__caret {
    transform: rotate(180deg);
}

/* Dropdown */
.nav-profile__dropdown {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    min-width: 200px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(12,14,22,0.96);
    backdrop-filter: blur(24px) saturate(1.5);
    -webkit-backdrop-filter: blur(24px) saturate(1.5);
    box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(108,99,255,0.08);
    padding: 0.45rem 0;
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transform: translateY(-8px) scale(0.97);
    transform-origin: top right;
    transition: opacity 0.22s cubic-bezier(0.4,0,0.2,1),
                transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
}

.nav-profile.open .nav-profile__dropdown {
    pointer-events: auto;
    opacity: 1;
    transform: translateY(0) scale(1);
}

.nav-profile__email-row {
    padding: 0.55rem 1rem 0.45rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 0.3rem;
}

.nav-profile__email-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(244,244,247,0.3);
    margin-bottom: 0.15rem;
}

.nav-profile__email-val {
    font-size: 0.78rem;
    color: rgba(244,244,247,0.65);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 170px;
}

.nav-profile__item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.52rem 1rem;
    font-size: 0.83rem;
    font-weight: 500;
    color: rgba(244,244,247,0.72);
    cursor: pointer;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    transition: background 0.13s, color 0.13s, transform 0.13s;
    border-radius: 0;
}

.nav-profile__item:hover {
    background: rgba(108,99,255,0.1);
    color: #f4f4f7;
    transform: translateX(2px);
}

.nav-profile__item--danger {
    color: rgba(239,100,100,0.8);
}

.nav-profile__item--danger:hover {
    background: rgba(239,68,68,0.1);
    color: #fca5a5;
}

.nav-profile__item-icon {
    width: 16px;
    height: 16px;
    opacity: 0.7;
    flex-shrink: 0;
}

/* Slide-in animation for the whole profile block */
@keyframes navProfileIn {
    from { opacity: 0; transform: scale(0.85) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
}

.nav-profile {
    animation: navProfileIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both;
}

/* ── Modal morphing ──────────────────────────────────────── */
.modal-overlay {
    transition: opacity 0.28s ease, visibility 0.28s ease !important;
}

.modal {
    transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1) !important;
    overflow: hidden;
}

/* Inner form wrapper for height morphing */
.modal-form-wrap {
    transition: height 0.38s cubic-bezier(0.4,0,0.2,1);
    overflow: hidden;
}

/* Field stagger */
.modal__field,
.modal-form-wrap .btn-modal-primary,
.modal-form-wrap .modal__footer-text {
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.32s ease, transform 0.32s ease;
}

.modal__field.field-visible,
.modal-form-wrap .btn-modal-primary.field-visible,
.modal-form-wrap .modal__footer-text.field-visible {
    opacity: 1;
    transform: translateY(0);
}

/* Button hover scale */
.btn-modal-primary {
    transition: background 0.18s, transform 0.18s, box-shadow 0.18s, opacity 0.18s !important;
}

.btn-modal-primary:hover:not(:disabled) {
    transform: scale(1.025) translateY(-1px) !important;
    box-shadow: 0 8px 24px rgba(108,99,255,0.35) !important;
}

.btn-modal-primary:active:not(:disabled) {
    transform: scale(0.975) !important;
}

/* Success state overlay */
.modal-success-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: rgba(12,14,22,0.92);
    backdrop-filter: blur(6px);
    border-radius: 16px;
    z-index: 10;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.28s ease;
}

.modal-success-overlay.visible {
    pointer-events: auto;
    opacity: 1;
}

.success-ring {
    position: relative;
    width: 72px;
    height: 72px;
}

.success-ring svg {
    width: 72px;
    height: 72px;
}

.success-ring__bg {
    fill: none;
    stroke: rgba(45,212,191,0.15);
    stroke-width: 4;
}

.success-ring__arc {
    fill: none;
    stroke: #2dd4bf;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 188;
    stroke-dashoffset: 188;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
    animation: arcDraw 0.55s 0.1s cubic-bezier(0.4,0,0.2,1) forwards;
}

@keyframes arcDraw {
    to { stroke-dashoffset: 0; }
}

.success-check {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.success-check svg {
    width: 30px;
    height: 30px;
    overflow: visible;
}

.success-check__path {
    fill: none;
    stroke: #2dd4bf;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: checkDraw 0.35s 0.55s ease forwards;
}

@keyframes checkDraw {
    to { stroke-dashoffset: 0; }
}

@keyframes successPulse {
    0%   { box-shadow: 0 0 0 0 rgba(45,212,191,0.5); }
    70%  { box-shadow: 0 0 0 18px rgba(45,212,191,0); }
    100% { box-shadow: 0 0 0 0 rgba(45,212,191,0); }
}

.success-ring { animation: successPulse 0.9s 0.2s ease-out; }

.success-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: #2dd4bf;
    letter-spacing: 0.02em;
    opacity: 0;
    transform: translateY(8px);
    animation: successLabelIn 0.35s 0.7s ease forwards;
}

@keyframes successLabelIn {
    to { opacity: 1; transform: translateY(0); }
}

/* ── Slide transition between sign-in / sign-up ──────────── */
@keyframes slideInRight {
    from { opacity: 0; transform: translateX(28px); }
    to   { opacity: 1; transform: translateX(0); }
}

@keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-28px); }
    to   { opacity: 1; transform: translateX(0); }
}

.modal-slide-right { animation: slideInRight 0.32s cubic-bezier(0.4,0,0.2,1) both; }
.modal-slide-left  { animation: slideInLeft  0.32s cubic-bezier(0.4,0,0.2,1) both; }

/* Greeting pop */
@keyframes greetingPop {
    0%   { opacity:0; transform: scale(0.8) translateY(4px); }
    70%  { transform: scale(1.04) translateY(-1px); }
    100% { opacity:1; transform: scale(1) translateY(0); }
}

.nav-greeting-anim {
    animation: greetingPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
}
        `;
        document.head.appendChild(s);
    })();

    /* ─────────────────────────────────────────────
       UTILITY
    ───────────────────────────────────────────── */
    function hasSupabase() { return !!(window.SB && window.SB.client); }

    function getToken() {
        try {
            if (hasSupabase() && typeof window.SB.getToken === "function") return window.SB.getToken();
            return localStorage.getItem(TOKEN_KEY);
        } catch (e) { return null; }
    }

    function setToken(t) {
        try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    }

    function saveName(name, email) {
        try {
            if (name)  localStorage.setItem(NAME_KEY,  name);
            if (email) localStorage.setItem(EMAIL_KEY, email);
        } catch (_) {}
    }

    function loadName()  { try { return localStorage.getItem(NAME_KEY)  || null; } catch(_){ return null; } }
    function loadEmail() { try { return localStorage.getItem(EMAIL_KEY) || null; } catch(_){ return null; } }

    function clearSession() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(NAME_KEY);
            localStorage.removeItem(EMAIL_KEY);
        } catch (_) {}
    }

    function initials(name, email) {
        if (name && name.trim()) {
            var parts = name.trim().split(/\s+/);
            if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
            return parts[0].slice(0, 2).toUpperCase();
        }
        if (email) return email.slice(0, 2).toUpperCase();
        return "U";
    }

    function firstName(name) {
        if (!name || !name.trim()) return null;
        return name.trim().split(/\s+/)[0];
    }

    function closeModalById(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        /* Remove success overlay if any */
        var ov = el.querySelector(".modal-success-overlay");
        if (ov) ov.remove();
    }

    /* ─────────────────────────────────────────────
       STAGGER FIELDS
    ───────────────────────────────────────────── */
    function staggerFields(form) {
        /* Gather fields + primary button + footer text */
        var items = [];
        form.querySelectorAll(".modal__field").forEach(function(f){ items.push(f); });
        form.querySelectorAll(".btn-modal-primary").forEach(function(f){ items.push(f); });
        form.querySelectorAll(".modal__footer-text").forEach(function(f){ items.push(f); });

        items.forEach(function(el){ el.classList.remove("field-visible"); });

        items.forEach(function(el, i) {
            setTimeout(function() {
                el.classList.add("field-visible");
            }, 60 + i * 75);
        });
    }

    /* ─────────────────────────────────────────────
       SUCCESS OVERLAY
    ───────────────────────────────────────────── */
    function showSuccessOverlay(modal, label, cb) {
        /* Remove old */
        var old = modal.querySelector(".modal-success-overlay");
        if (old) old.remove();

        var ov = document.createElement("div");
        ov.className = "modal-success-overlay";
        ov.innerHTML = `
            <div class="success-ring">
                <svg viewBox="0 0 72 72">
                    <circle class="success-ring__bg" cx="36" cy="36" r="30"/>
                    <circle class="success-ring__arc" cx="36" cy="36" r="30"/>
                </svg>
                <div class="success-check">
                    <svg viewBox="0 0 30 30">
                        <path class="success-check__path" d="M7 15 L13 21 L23 9"/>
                    </svg>
                </div>
            </div>
            <span class="success-label">${label || "Success!"}</span>
        `;
        modal.style.position = "relative";
        modal.appendChild(ov);

        requestAnimationFrame(function(){
            requestAnimationFrame(function(){ ov.classList.add("visible"); });
        });

        setTimeout(function() {
            ov.style.transition = "opacity 0.3s ease";
            ov.style.opacity = "0";
            setTimeout(function() {
                ov.remove();
                if (cb) cb();
            }, 300);
        }, 1100);
    }

    /* ─────────────────────────────────────────────
       MODAL TRANSITION (Sign In ↔ Sign Up)
    ───────────────────────────────────────────── */
    function morphModal(fromId, toId, direction) {
        var fromEl = document.getElementById(fromId);
        var toEl   = document.getElementById(toId);
        if (!fromEl || !toEl) return;

        /* Decide slide direction */
        var outClass = direction === "right" ? "slideInRight" : "slideInLeft";

        /* Close from */
        fromEl.classList.remove("is-open");
        fromEl.setAttribute("aria-hidden", "true");

        /* Open to */
        toEl.classList.add("is-open");
        toEl.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        /* Slide inner modal */
        var inner = toEl.querySelector(".modal");
        if (inner) {
            var cls = direction === "right" ? "modal-slide-right" : "modal-slide-left";
            inner.classList.remove("modal-slide-right", "modal-slide-left");
            void inner.offsetWidth; /* force reflow */
            inner.classList.add(cls);
        }

        /* Stagger the target form's fields */
        var form = toEl.querySelector("form");
        if (form) staggerFields(toEl);
    }

    /* ─────────────────────────────────────────────
       OPEN MODAL (enhanced)
    ───────────────────────────────────────────── */
    function openModal(id) {
        /* Close others */
        document.querySelectorAll(".modal-overlay.is-open").forEach(function(o){
            o.classList.remove("is-open");
            o.setAttribute("aria-hidden", "true");
        });

        var el = document.getElementById(id);
        if (!el) return;

        el.classList.add("is-open");
        el.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        /* Slide in modal card */
        var inner = el.querySelector(".modal");
        if (inner) {
            inner.classList.remove("modal-slide-right", "modal-slide-left");
            void inner.offsetWidth;
            inner.classList.add("modal-slide-right");
        }

        /* Stagger fields */
        staggerFields(el);
    }

    /* ─────────────────────────────────────────────
       NAVBAR PROFILE
    ───────────────────────────────────────────── */
    function buildProfileButton(name, email) {
        var initStr = initials(name, email);
        var fn      = firstName(name) || (email ? email.split("@")[0] : "Account");

        var wrap = document.createElement("div");
        wrap.className  = "nav-profile";
        wrap.tabIndex   = 0;
        wrap.setAttribute("aria-haspopup", "true");
        wrap.setAttribute("aria-expanded", "false");
        wrap.innerHTML = `
            <button class="nav-profile__btn nav-greeting-anim" type="button" aria-label="Account menu">
                <span class="nav-profile__avatar">${initStr}</span>
                Hi, ${fn}
                <svg class="nav-profile__caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <polyline points="4 6 8 10 12 6"/>
                </svg>
            </button>
            <div class="nav-profile__dropdown" role="menu">
                <div class="nav-profile__email-row">
                    <div class="nav-profile__email-label">Signed in as</div>
                    <div class="nav-profile__email-val">${email || name || "—"}</div>
                </div>
                <button class="nav-profile__item" role="menuitem" data-action="settings">
                    <svg class="nav-profile__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Settings
                </button>
                <button class="nav-profile__item nav-profile__item--danger" role="menuitem" data-action="logout">
                    <svg class="nav-profile__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign out
                </button>
            </div>
        `;

        /* Toggle dropdown */
        function toggle(e) {
            e.stopPropagation();
            var isOpen = wrap.classList.toggle("open");
            wrap.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }

        wrap.querySelector(".nav-profile__btn").addEventListener("click", toggle);
        wrap.addEventListener("keydown", function(e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); }
            if (e.key === "Escape") { wrap.classList.remove("open"); wrap.setAttribute("aria-expanded","false"); }
        });

        /* Close on outside click */
        document.addEventListener("click", function(e) {
            if (!wrap.contains(e.target)) {
                wrap.classList.remove("open");
                wrap.setAttribute("aria-expanded","false");
            }
        });

        /* Item actions */
        wrap.querySelectorAll("[data-action]").forEach(function(btn) {
            btn.addEventListener("click", function() {
                var action = btn.getAttribute("data-action");
                wrap.classList.remove("open");
                if (action === "logout") {
                    performSignOut();
                } else if (action === "settings") {
                    /* Route to settings or open a modal */
                    alert("Settings — coming soon in PrepLoom v2 ✨");
                }
            });
        });

        return wrap;
    }

    /* ─────────────────────────────────────────────
       REFRESH NAV (public entry point)
    ───────────────────────────────────────────── */
    function refreshNav(name, email) {
        /* Works on marketing pages (site-nav__auth) and the app page */
        var slots = document.querySelectorAll("#navAuthSlot, .site-nav__auth");

        /* Read stored values if not passed */
        var displayName  = name  || loadName();
        var displayEmail = email || loadEmail();
        var loggedIn     = !!displayName || !!displayEmail;

        slots.forEach(function(slot) {
            /* Remove old profile button if any */
            var old = slot.querySelector(".nav-profile");
            if (old) old.remove();

            var authButtons = slot.querySelector("#navAuthButtons");
            var emailEl     = slot.querySelector("#navUserEmail");
            var logoutBtn   = slot.querySelector("#navLogout");

            if (loggedIn) {
                /* Hide legacy auth controls */
                if (authButtons) authButtons.setAttribute("hidden", "");
                if (emailEl)     emailEl.setAttribute("hidden", "");
                if (logoutBtn)   logoutBtn.setAttribute("hidden", "");

                /* Inject premium profile button */
                var profileBtn = buildProfileButton(displayName, displayEmail);
                slot.appendChild(profileBtn);
            } else {
                /* Show legacy auth controls */
                if (authButtons) authButtons.removeAttribute("hidden");
                if (emailEl)     emailEl.setAttribute("hidden", "");
                if (logoutBtn)   logoutBtn.setAttribute("hidden", "");
            }
        });

        /* App page hint */
        var hint = document.getElementById("appAuthHint");
        if (hint) {
            if (loggedIn && displayEmail) {
                var fn = firstName(displayName);
                hint.innerHTML = fn
                    ? `<span style="color:#2dd4bf;font-weight:600;">Hi, ${fn}!</span> <span style="color:rgba(240,242,248,0.4);">${displayEmail}</span>`
                    : `<span style="color:rgba(240,242,248,0.4);">Signed in as ${displayEmail}</span>`;
            } else {
                hint.innerHTML = '<a href="/">Sign in</a> to save sessions to your account (optional).';
            }
        }
    }

    /* ─────────────────────────────────────────────
       SIGN OUT
    ───────────────────────────────────────────── */
    function performSignOut() {
        if (hasSupabase()) {
            window.SB.client.auth.signOut().catch(function(){});
        }
        clearSession();
        /* Animated removal of profile btn */
        document.querySelectorAll(".nav-profile").forEach(function(el) {
            el.style.transition = "opacity 0.3s, transform 0.3s";
            el.style.opacity = "0";
            el.style.transform = "scale(0.85) translateY(-4px)";
            setTimeout(function() { refreshNav(null, null); }, 300);
        });
    }

    /* ─────────────────────────────────────────────
       GET CURRENT USER
    ───────────────────────────────────────────── */
    async function getCurrentUser() {
        if (hasSupabase()) {
            var sd = await window.SB.client.auth.getSession().catch(function(){ return {}; });
            var session = sd && sd.data && sd.data.session;
            if (!session || !session.user) { clearSession(); return null; }
            setToken(session.access_token || "");
            return session.user;
        }
        var t = getToken();
        if (!t) return null;
        var res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + t } }).catch(function(){ return {ok:false}; });
        if (!res.ok) { clearSession(); return null; }
        return res.json().catch(function(){ return null; });
    }

    /* ─────────────────────────────────────────────
       WIRE FORMS (Sign In + Sign Up)
    ───────────────────────────────────────────── */
    function setError(errId, msg) {
        var el = document.getElementById(errId);
        if (!el) return;
        el.textContent = msg || "";
        if (msg) el.removeAttribute("hidden"); else el.setAttribute("hidden", "");
    }

    function setButtonBusy(btn, busy) {
        if (!btn) return function(){};
        var prev = btn.innerHTML;
        btn.disabled = !!busy;
        if (busy) btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.65s linear infinite;display:inline-block;"></span> Working…</span>';
        return function() { btn.disabled = false; btn.innerHTML = prev; };
    }

    function wireSignInForm() {
        var form = document.getElementById("formSignin");
        if (!form || form.dataset.premiumBound) return;
        form.dataset.premiumBound = "true";

        form.addEventListener("submit", async function(ev) {
            ev.preventDefault();
            setError("signinError", "");
            var fd    = new FormData(form);
            var email = String(fd.get("email") || "").trim();
            var pass  = String(fd.get("password") || "");
            var btn   = form.querySelector('[type="submit"]');
            var restore = setButtonBusy(btn, true);

            try {
                var userData = null;

                if (hasSupabase()) {
                    var sd = await window.SB.signInWithEmail(email, pass);
                    var user = sd && (sd.user || (sd.session && sd.session.user));
                    if (user) {
                        var nm = user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name);
                        saveName(nm || "", email);
                        userData = { name: nm, email: email };
                    }
                } else {
                    var res = await fetch("/api/auth/login", {
                        method: "POST",
                        headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({ email: email, password: pass })
                    });
                    if (!res.ok) throw new Error((await res.json().catch(function(){ return {}; })).detail || "Login failed");
                    var data = await res.json();
                    if (data.access_token) setToken(data.access_token);
                    saveName(data.name || "", email);
                    userData = { name: data.name, email: email };
                }

                restore();
                var fn = firstName(userData && userData.name) || email.split("@")[0];
                var modal = document.getElementById("modal-signin");
                if (modal) {
                    showSuccessOverlay(modal, `Welcome back, ${fn}!`, function() {
                        closeModalById("modal-signin");
                        form.reset();
                        refreshNav(userData && userData.name, email);
                    });
                }
            } catch(e) {
                restore();
                var msg = String(e.message || e);
                if (/invalid login/i.test(msg)) msg = "Invalid credentials. If you signed up with Google, use that button instead.";
                setError("signinError", msg);
            }
        });
    }

    function wireSignUpForm() {
        var form = document.getElementById("formSignup");
        if (!form || form.dataset.premiumBound) return;
        form.dataset.premiumBound = "true";

        form.addEventListener("submit", async function(ev) {
            ev.preventDefault();
            setError("signupError", "");
            var fd    = new FormData(form);
            var name  = String(fd.get("name") || "").trim();
            var email = String(fd.get("email") || "").trim();
            var pass  = String(fd.get("password") || "");
            var btn   = form.querySelector('[type="submit"]');
            var restore = setButtonBusy(btn, true);

            try {
                if (hasSupabase()) {
                    var sd = await window.SB.signUpWithEmail(name, email, pass);
                    var needsEmail = !(sd && sd.session);
                    restore();
                    var modal = document.getElementById("modal-signup");
                    if (needsEmail) {
                        if (modal) {
                            showSuccessOverlay(modal, "Check your inbox!", function() {
                                closeModalById("modal-signup");
                                form.reset();
                            });
                        }
                    } else {
                        saveName(name, email);
                        if (modal) {
                            showSuccessOverlay(modal, `Welcome, ${firstName(name) || email.split("@")[0]}!`, function() {
                                closeModalById("modal-signup");
                                form.reset();
                                refreshNav(name, email);
                            });
                        }
                    }
                } else {
                    var body = { email: email, password: pass };
                    if (name) body.name = name;
                    var res = await fetch("/api/auth/register", {
                        method: "POST",
                        headers: {"Content-Type":"application/json"},
                        body: JSON.stringify(body)
                    });
                    if (!res.ok) throw new Error((await res.json().catch(function(){ return {}; })).detail || "Registration failed");
                    var data = await res.json();
                    if (data.access_token) setToken(data.access_token);
                    saveName(name, email);
                    restore();
                    var modal2 = document.getElementById("modal-signup");
                    if (modal2) {
                        showSuccessOverlay(modal2, `Account created!`, function() {
                            closeModalById("modal-signup");
                            form.reset();
                            refreshNav(name, email);
                        });
                    }
                }
            } catch(e) {
                restore();
                setError("signupError", String(e.message || e));
            }
        });
    }

    /* ─────────────────────────────────────────────
       WIRE MODAL OPEN BUTTONS
    ───────────────────────────────────────────── */
    function wireModalTriggers() {
        document.querySelectorAll("[data-open-modal]").forEach(function(btn) {
            if (btn.dataset.premiumBound) return;
            btn.dataset.premiumBound = "true";
            btn.addEventListener("click", function() {
                openModal(btn.getAttribute("data-open-modal"));
            });
        });

        document.querySelectorAll(".modal-overlay").forEach(function(overlay) {
            if (overlay.dataset.premiumBound) return;
            overlay.dataset.premiumBound = "true";
            overlay.addEventListener("click", function(e) {
                if (e.target === overlay) {
                    overlay.classList.remove("is-open");
                    overlay.setAttribute("aria-hidden", "true");
                    document.body.style.overflow = "";
                }
            });
        });

        document.querySelectorAll("[data-close-modal]").forEach(function(btn) {
            if (btn.dataset.premiumBound) return;
            btn.dataset.premiumBound = "true";
            btn.addEventListener("click", function() {
                var overlay = btn.closest(".modal-overlay");
                if (overlay) {
                    overlay.classList.remove("is-open");
                    overlay.setAttribute("aria-hidden", "true");
                    document.body.style.overflow = "";
                }
            });
        });

        document.addEventListener("keydown", function(e) {
            if (e.key !== "Escape") return;
            document.querySelectorAll(".modal-overlay.is-open").forEach(function(o) {
                o.classList.remove("is-open");
                o.setAttribute("aria-hidden", "true");
            });
            document.body.style.overflow = "";
        });

        /* Switch links inside modals (No account? Sign up) */
        document.querySelectorAll("[data-open-modal='modal-signup']").forEach(function(btn) {
            if (btn.closest(".modal-overlay")) {
                btn.addEventListener("click", function(e) {
                    e.stopPropagation();
                    morphModal("modal-signin", "modal-signup", "right");
                });
            }
        });

        document.querySelectorAll("[data-open-modal='modal-signin']").forEach(function(btn) {
            if (btn.closest(".modal-overlay")) {
                btn.addEventListener("click", function(e) {
                    e.stopPropagation();
                    morphModal("modal-signup", "modal-signin", "left");
                });
            }
        });
    }

    /* ─────────────────────────────────────────────
       WIRE GOOGLE BUTTONS
    ───────────────────────────────────────────── */
    function wireGoogleButtons() {
        document.querySelectorAll("[data-auth-provider='google']").forEach(function(btn) {
            if (btn.dataset.premiumBound) return;
            btn.dataset.premiumBound = "true";
            btn.addEventListener("click", async function() {
                if (!hasSupabase()) {
                    var errId = btn.getAttribute("data-error-target");
                    if (errId) setError(errId, "Supabase is not configured yet.");
                    return;
                }
                var restore = setButtonBusy(btn, true);
                try {
                    await window.SB.signInWithGoogle();
                } catch(e) {
                    restore();
                    var errId2 = btn.getAttribute("data-error-target");
                    if (errId2) setError(errId2, String(e.message || e));
                }
            });
        });
    }

    /* ─────────────────────────────────────────────
       INIT
    ───────────────────────────────────────────── */
    async function init() {
        wireModalTriggers();
        wireSignInForm();
        wireSignUpForm();
        wireGoogleButtons();

        /* Restore session from storage/Supabase */
        try {
            var user = await getCurrentUser();
            if (user && user.email) {
                var nm = user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name);
                saveName(nm || loadName() || "", user.email);
                refreshNav(nm || loadName(), user.email);
            } else {
                refreshNav(null, null);
            }
        } catch (_) {
            refreshNav(loadName(), loadEmail());
        }
    }

    /* ─────────────────────────────────────────────
       SUPABASE AUTH STATE SYNC
    ───────────────────────────────────────────── */
    function bindSupabaseSync() {
        if (!hasSupabase() || window.__preploomPremiumSyncBound) return;
        window.__preploomPremiumSyncBound = true;
        window.SB.client.auth.onAuthStateChange(async function(_event, session) {
            if (session && session.user) {
                var user = session.user;
                setToken(session.access_token || "");
                var nm = user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name);
                saveName(nm || loadName() || "", user.email);
                refreshNav(nm || loadName(), user.email);
            } else {
                refreshNav(null, null);
            }
        });
    }

    /* ─────────────────────────────────────────────
       PUBLIC API (backwards compat with auth.js)
    ───────────────────────────────────────────── */
    window.PrepLoomAuthPremium = {
        refreshNav:  refreshNav,
        openModal:   openModal,
        closeModal:  closeModalById,
        signOut:     performSignOut,
    };

    /* Expose on PrepLoomAuth for drop-in compat */
    window.PrepLoomAuth = {
        TOKEN_KEY:        TOKEN_KEY,
        getToken:         getToken,
        setToken:         setToken,
        clearToken:       clearSession,
        refreshMarketingNav: function() { refreshNav(loadName(), loadEmail()); },
        refreshAuthUI:    function() { refreshNav(loadName(), loadEmail()); },
    };

    /* Start */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.addEventListener("supabase:ready", function() {
        bindSupabaseSync();
        init();
    });

})();