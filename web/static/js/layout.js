/**
 * PrepLoom — Global Layout Component
 *
 * Injects an identical Navigation Bar, Footer, Auth Modals,
 * and Intro Animation on every page for 100% UI consistency.
 *
 * Features:
 *   • Persistent nav with glassmorphism glow hover effects
 *   • One-time landing animation per session (sessionStorage)
 *     — plays ONLY on first website visit, never again until tab/browser is closed
 *   • Smooth page-to-page fade-in transitions
 *   • Active link detection based on current path
 */

const PrepLoomLayout = (function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────
    const NAV_LINKS = [
        { href: '/',         label: 'Home' },
        { href: '/features', label: 'Features' },
        { href: '/revision', label: 'Revision' },
        { href: '/about',    label: 'About' },
    ];
    const CTA_LINK = { href: '/app', label: 'Practice' };
    const FOOTER_LINKS = [
        { href: '/features', label: 'Features' },
        { href: '/revision', label: 'Revision' },
        { href: '/about',    label: 'About' },
        { href: '/app',      label: 'Practice' },
    ];
    const SESSION_KEY = 'preploom_intro_seen';
    const INTRO_DURATION = 4200;
    const INTRO_EXIT_MS = 900;

    // ── Detect current page ───────────────────────────────────────
    function currentPath() {
        return window.location.pathname.replace(/\/+$/, '') || '/';
    }

    function isActive(href) {
        var path = currentPath();
        if (href === '/') return path === '/';
        return path.startsWith(href);
    }

    // ── SVG icon helpers ──────────────────────────────────────────
    function settingsSvg() {
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.49.83.83 1.51 1H21a2 2 0 0 1 0 4h-.09c-.67.17-1.15.52-1.51 1z"></path></svg>';
    }

    function logoutSvg() {
        return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
    }

    // ── Build Navigation HTML ─────────────────────────────────────
    function buildNav() {
        var links = NAV_LINKS.map(function (l) {
            var cls = 'site-nav__link' + (isActive(l.href) ? ' site-nav__link--active' : '');
            return '<a class="' + cls + '" href="' + l.href + '">' + l.label + '</a>';
        }).join('\n');

        return '<header class="site-nav" role="navigation" aria-label="Primary" id="globalNav">' +
            '<a class="site-nav__brand" href="/">' +
                '<img src="/static/logo.png" alt="PrepLoom logo" />' +
                'PrepLoom' +
            '</a>' +
            '<nav class="site-nav__links" aria-label="Main">' +
                links +
                '<a class="site-nav__link site-nav__link--cta" href="' + CTA_LINK.href + '">' + CTA_LINK.label + '</a>' +
            '</nav>' +
            '<div class="site-nav__auth" id="navAuthSlot">' +
                '<button type="button" id="themeToggle" class="btn-nav-outline home-icon-button" title="Toggle theme">' +
                    '<span data-theme-icon aria-hidden="true"></span>' +
                '</button>' +
                '<a href="/settings" class="btn-nav-outline home-icon-button" title="Settings" aria-label="Settings">' +
                    settingsSvg() +
                '</a>' +
                '<div class="nav-user-menu">' +
                    '<button type="button" id="navUserEmail" class="nav-user-email hidden" aria-expanded="false" aria-haspopup="true" title="Account menu"></button>' +
                    '<div id="userDropdownMenu" class="user-dropdown-menu">' +
                        '<a href="/settings" class="user-dropdown-menu__link">' +
                            settingsSvg() + ' Settings' +
                        '</a>' +
                        '<button type="button" id="navLogout" class="user-dropdown-menu__button hidden">' +
                            logoutSvg() + ' Log out' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div id="navAuthButtons">' +
                    '<button type="button" class="btn-nav-outline" data-open-modal="modal-signin">Sign in</button>' +
                    '<button type="button" class="btn-nav-primary" data-open-modal="modal-signup">Sign up</button>' +
                '</div>' +
            '</div>' +
        '</header>';
    }

    // ── Build Footer HTML ─────────────────────────────────────────
    function buildFooter() {
        var links = FOOTER_LINKS.map(function (l) {
            return '<a href="' + l.href + '">' + l.label + '</a>';
        }).join('\n');

        return '<footer class="site-footer">' +
            '<div class="site-footer__inner">' +
                '<span>&copy; 2026 PrepLoom. All rights reserved.</span>' +
                '<div class="site-footer__links">' + links + '</div>' +
            '</div>' +
        '</footer>';
    }

    // ── Build Modals HTML ─────────────────────────────────────────
    function buildModals() {
        return '' +
        '<div id="modal-signin" class="modal-overlay" aria-hidden="true" role="dialog" aria-labelledby="signin-title">' +
            '<div class="modal">' +
                '<div class="modal__header">' +
                    '<h2 id="signin-title">Sign in</h2>' +
                    '<button type="button" class="modal__close" data-close-modal aria-label="Close">&times;</button>' +
                '</div>' +
                '<p class="modal__note">Sign in with Supabase to manage your settings and preferences.</p>' +
                '<p id="signinError" class="modal-error" hidden></p>' +
                '<form id="formSignin">' +
                    '<div class="modal__field">' +
                        '<label for="signin-email">Email</label>' +
                        '<input id="signin-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required />' +
                    '</div>' +
                    '<div class="modal__field">' +
                        '<label for="signin-password">Password</label>' +
                        '<input id="signin-password" name="password" type="password" autocomplete="current-password" placeholder="At least 8 characters" required minlength="8" />' +
                    '</div>' +
                    '<button type="submit" class="btn-modal-primary">Sign in</button>' +
                '</form>' +
                '<button type="button" data-auth-provider="google" data-error-target="signinError" class="btn-modal-primary" style="width:100%;margin-top:0.75rem;background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.18);">Continue with Google</button>' +
                '<p class="modal__footer-text">No account? <button type="button" data-open-modal="modal-signup">Sign up</button></p>' +
            '</div>' +
        '</div>' +
        '<div id="modal-signup" class="modal-overlay" aria-hidden="true" role="dialog" aria-labelledby="signup-title">' +
            '<div class="modal">' +
                '<div class="modal__header">' +
                    '<h2 id="signup-title">Create account</h2>' +
                    '<button type="button" class="modal__close" data-close-modal aria-label="Close">&times;</button>' +
                '</div>' +
                '<p class="modal__note">Create an account to save your progress and settings.</p>' +
                '<p id="signupError" class="modal-error" hidden></p>' +
                '<form id="formSignup">' +
                    '<div class="modal__field">' +
                        '<label for="signup-name">Name <span class="modal-optional">(optional)</span></label>' +
                        '<input id="signup-name" name="name" type="text" autocomplete="name" placeholder="Your name" maxlength="120" />' +
                    '</div>' +
                    '<div class="modal__field">' +
                        '<label for="signup-email">Email</label>' +
                        '<input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />' +
                    '</div>' +
                    '<div class="modal__field">' +
                        '<label for="signup-password">Password</label>' +
                        '<input id="signup-password" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required minlength="8" />' +
                    '</div>' +
                    '<button type="submit" class="btn-modal-primary">Create account</button>' +
                '</form>' +
                '<button type="button" data-auth-provider="google" data-error-target="signupError" class="btn-modal-primary" style="width:100%;margin-top:0.75rem;background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.18);">Continue with Google</button>' +
                '<p class="modal__footer-text">Already have an account? <button type="button" data-open-modal="modal-signin">Sign in</button></p>' +
            '</div>' +
        '</div>';
    }

    // ── Build Intro Loader HTML ───────────────────────────────────
    // Each letter has a random origin direction (top, bottom, left, right, diagonals)
    function buildIntroLoader() {
        var directions = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];
        var brand = 'PrepLoom';
        var letterSpans = '';
        for (var i = 0; i < brand.length; i++) {
            var dir = directions[i % directions.length];
            letterSpans += '<span class="intro-letter" data-dir="' + dir + '" style="--i:' + i + '">' + brand[i] + '</span>';
        }

        var tagWords = ['AI-Powered', 'Interview', 'Coaching'];
        var tagSpans = '';
        for (var j = 0; j < tagWords.length; j++) {
            var tDir = directions[(j * 3) % directions.length];
            tagSpans += '<span class="intro-tag" data-dir="' + tDir + '" style="--j:' + j + '">' + tagWords[j] + '</span>';
        }

        return '<div id="introLoader" class="intro-overlay" aria-hidden="true">' +
            '<div class="intro-canvas-bg" id="introParticles"></div>' +
            /* Floating fragments that converge */
            '<div class="intro-fragments" id="introFragments"></div>' +
            /* Central logo */
            '<div class="intro-logo-wrap">' +
                '<div class="intro-logo-ring intro-logo-ring--1"></div>' +
                '<div class="intro-logo-ring intro-logo-ring--2"></div>' +
                '<div class="intro-logo-ring intro-logo-ring--3"></div>' +
                '<div class="intro-logo-mark">PL</div>' +
                '<div class="intro-logo-glow"></div>' +
            '</div>' +
            /* Letters flying in from all sides */
            '<div class="intro-brand-wrap">' + letterSpans + '</div>' +
            /* Tagline words arriving from different directions */
            '<div class="intro-tagline-wrap">' + tagSpans + '</div>' +
            /* Status + progress */
            '<div class="intro-status">' +
                '<span class="intro-pulse"></span>' +
                'Initializing simulation core' +
            '</div>' +
            '<div class="intro-progress"><div class="intro-progress-bar"></div></div>' +
        '</div>';
    }

    // ── Session check for intro ───────────────────────────────────
    function shouldShowIntro() {
        // Show intro ONLY on home page AND only the very first time
        // in this browser session (tab open). Once seen, never show
        // again until the browser/tab is fully closed.
        if (currentPath() !== '/') return false;
        try {
            if (sessionStorage.getItem(SESSION_KEY)) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function markIntroSeen() {
        try {
            sessionStorage.setItem(SESSION_KEY, '1');
        } catch (e) { /* no-op */ }
    }

    // ── Inject the layout into the page ───────────────────────────
    function inject() {
        var siteWrap = document.querySelector('.site-wrap');
        if (!siteWrap) return;

        // Page fade-in wrapper
        siteWrap.classList.add('layout-fade-in');

        // Remove existing nav, footer, modals (they will be replaced)
        var existingNav = siteWrap.querySelector('.site-nav');
        if (existingNav) existingNav.remove();

        var existingFooter = siteWrap.querySelector('.site-footer');
        if (existingFooter) existingFooter.remove();

        ['modal-signin', 'modal-signup'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.remove();
        });

        var existingLoader = document.getElementById('introLoader');
        if (existingLoader) existingLoader.remove();

        // Inject nav at the beginning of site-wrap
        siteWrap.insertAdjacentHTML('afterbegin', buildNav());

        // Inject footer at the end of site-wrap
        siteWrap.insertAdjacentHTML('beforeend', buildFooter());

        // Inject modals after site-wrap
        siteWrap.insertAdjacentHTML('afterend', buildModals());

        // ── INTRO: mark seen BEFORE showing so even if user
        //    navigates away mid-animation it won't replay ──
        if (shouldShowIntro()) {
            markIntroSeen();                        // ← set flag FIRST
            document.body.insertAdjacentHTML('afterbegin', buildIntroLoader());
            runIntroAnimation();
        }

        // Theme toggle binding
        var themeBtn = document.getElementById('themeToggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', function () {
                if (typeof PrepLoom !== 'undefined' && PrepLoom.toggleTheme) {
                    PrepLoom.toggleTheme();
                } else if (typeof toggleTheme === 'function') {
                    toggleTheme();
                }
            });
        }

        // Enhanced nav hover effect — magnetic glow
        initNavGlowEffect();

        // Trigger page fade-in
        requestAnimationFrame(function () {
            siteWrap.classList.add('layout-visible');
        });
    }

    // ── Enhanced Nav Glow Effect ──────────────────────────────────
    function initNavGlowEffect() {
        var nav = document.getElementById('globalNav');
        if (!nav) return;

        // Create the glow follower element
        var glow = document.createElement('div');
        glow.className = 'nav-glow-follower';
        nav.appendChild(glow);

        var links = nav.querySelectorAll('.site-nav__link:not(.site-nav__link--cta)');

        links.forEach(function (link) {
            link.addEventListener('mouseenter', function () {
                var rect = link.getBoundingClientRect();
                var navRect = nav.getBoundingClientRect();
                glow.style.width = rect.width + 'px';
                glow.style.height = rect.height + 'px';
                glow.style.left = (rect.left - navRect.left) + 'px';
                glow.style.top = (rect.top - navRect.top) + 'px';
                glow.classList.add('active');
            });

            link.addEventListener('mouseleave', function () {
                glow.classList.remove('active');
            });
        });
    }

    // ── Intro Animation Runner ────────────────────────────────────
    function runIntroAnimation() {
        var loader = document.getElementById('introLoader');
        if (!loader) return;

        var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var dur = reducedMotion ? 1200 : INTRO_DURATION;

        // Draw particles on intro canvas
        drawIntroParticles();

        // Spawn floating code fragments
        spawnCodeFragments();

        // Phase 1 (0ms): letters start flying in (handled by CSS)
        // Phase 2 (~1.5s): logo appears, rings expand
        // Phase 3 (~2.5s): tagline arrives
        // Phase 4 (~3.5s): status + progress bar
        // Phase 5 (dur): exit animation

        setTimeout(function () {
            loader.classList.add('intro-overlay--exit');
            setTimeout(function () {
                loader.classList.add('intro-overlay--hidden');
                setTimeout(function () {
                    loader.remove();
                }, 500);
            }, INTRO_EXIT_MS);
        }, dur);
    }

    // ── Floating Code Fragments ───────────────────────────────────
    function spawnCodeFragments() {
        var container = document.getElementById('introFragments');
        if (!container) return;

        var fragments = [
            'const score = evaluate();',
            'analyze(posture)',
            '{ confidence: 92% }',
            'whisper.transcribe()',
            '<Interview />',
            'async coach()',
            'AI_MODEL.predict()',
            'feedback.map(f =>',
            'role: "Engineer"',
            'score += technical',
            'NLP.analyze()',
            'body_language: ✓',
        ];

        fragments.forEach(function (text, i) {
            var el = document.createElement('div');
            el.className = 'intro-code-frag';
            el.textContent = text;
            // Random position
            var angle = (i / fragments.length) * Math.PI * 2;
            var radius = 35 + Math.random() * 20; // % from center
            var x = 50 + Math.cos(angle) * radius;
            var y = 50 + Math.sin(angle) * radius;
            el.style.left = x + '%';
            el.style.top = y + '%';
            el.style.setProperty('--frag-delay', (0.2 + i * 0.15) + 's');
            el.style.setProperty('--frag-x', (Math.cos(angle) * 60) + 'px');
            el.style.setProperty('--frag-y', (Math.sin(angle) * 60) + 'px');
            container.appendChild(el);
        });
    }

    // ── Intro Particle Canvas ─────────────────────────────────────
    function drawIntroParticles() {
        var container = document.getElementById('introParticles');
        if (!container) return;

        var canvas = document.createElement('canvas');
        container.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var w, h, particles = [];
        var count = 80;

        function resize() {
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.width = w;
            canvas.height = h;
        }

        function init() {
            resize();
            particles = [];
            for (var i = 0; i < count; i++) {
                particles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.8,
                    vy: (Math.random() - 0.5) * 0.8,
                    r: Math.random() * 2 + 0.5,
                    alpha: Math.random() * 0.5 + 0.15,
                    hue: Math.random() > 0.5 ? 245 : 168, // purple or teal
                });
            }
        }

        function draw() {
            ctx.clearRect(0, 0, w, h);

            // Draw connections
            for (var i = 0; i < particles.length; i++) {
                for (var j = i + 1; j < particles.length; j++) {
                    var dx = particles[i].x - particles[j].x;
                    var dy = particles[i].y - particles[j].y;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 130) {
                        var strength = 1 - dist / 130;
                        ctx.strokeStyle = 'rgba(108,99,255,' + (strength * 0.12) + ')';
                        ctx.lineWidth = 0.6;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Draw dots
            for (var k = 0; k < particles.length; k++) {
                var p = particles[k];
                var color = p.hue === 245 ? '108,99,255' : '45,212,191';
                ctx.fillStyle = 'rgba(' + color + ',' + p.alpha + ')';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();

                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;
            }

            if (document.getElementById('introLoader')) {
                requestAnimationFrame(draw);
            }
        }

        init();
        draw();
        window.addEventListener('resize', resize);
    }

    // ── Initialize ────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }

    return { inject: inject, shouldShowIntro: shouldShowIntro };
})();
