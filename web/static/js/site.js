/**
 * PrepLoom global preferences applier for marketing and app pages.
 */
const PrepLoom = (function () {
    const PREFS_KEY = "preploom_prefs";
    const THEME_KEY = "pl-theme";

    function getThemeIconSvg(isDarkTheme) {
        if (isDarkTheme) {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2.2"></path><path d="M12 19.8V22"></path><path d="m4.93 4.93 1.56 1.56"></path><path d="m17.51 17.51 1.56 1.56"></path><path d="M2 12h2.2"></path><path d="M19.8 12H22"></path><path d="m4.93 19.07 1.56-1.56"></path><path d="m17.51 6.49 1.56-1.56"></path></svg>';
        }

        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.8 8.8 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg>';
    }

    function getPrefs() {
        try {
            var stored = localStorage.getItem(PREFS_KEY);
            if (stored) return JSON.parse(stored);
        } catch (error) {}
        return {};
    }

    function setPrefs(newPrefs) {
        try {
            var current = getPrefs();
            var merged = Object.assign({}, current, newPrefs);
            localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
            return merged;
        } catch (error) {
            return newPrefs;
        }
    }

    function lightenHex(hex, pct) {
        if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return hex;
        if (hex.length === 4) {
            hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }

        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;

        var lighten = function (value) {
            return Math.min(255, Math.floor(value + (255 - value) * pct / 100));
        };

        return "#" + [lighten(r), lighten(g), lighten(b)].map(function (value) {
            return value.toString(16).padStart(2, "0");
        }).join("");
    }

    function hexToRgba(hex, alpha) {
        if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return hex;
        if (hex.length === 4) {
            hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }

        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;

        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }

    function updateThemeToggleIcons(theme) {
        var icons = document.querySelectorAll("[data-theme-icon]");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = theme === "dark" || (theme === "system" && prefersDark);

        icons.forEach(function (icon) {
            icon.innerHTML = getThemeIconSvg(isDark);
        });
    }

    function applyTheme(theme) {
        var nextTheme = (theme || "system").toLowerCase();
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = nextTheme === "dark" || (nextTheme === "system" && prefersDark);
        var applied = isDark ? "dark" : "light";

        document.documentElement.setAttribute("data-theme", applied);
        document.documentElement.classList.toggle("theme-dark", isDark);
        document.documentElement.classList.toggle("theme-light", !isDark);

        if (document.body) {
            document.body.classList.toggle("theme-dark", isDark);
            document.body.classList.toggle("theme-light", !isDark);
        }

        updateThemeToggleIcons(nextTheme);
        localStorage.setItem(THEME_KEY, applied);

        if (theme) {
            var prefs = getPrefs();
            if (prefs.theme !== theme) {
                setPrefs({ theme: theme });
            }
        }
    }

    function toggleTheme() {
        var prefs = getPrefs();
        var current = prefs.theme || localStorage.getItem(THEME_KEY) || "dark";
        var next = current === "dark" ? "light" : "dark";
        applyTheme(next);
    }

    function applyAccent(color) {
        if (!color) return;
        document.documentElement.style.setProperty("--accent", color);
        document.documentElement.style.setProperty("--primary", color);
        document.documentElement.style.setProperty("--accent-2", lightenHex(color, 20));
        document.documentElement.style.setProperty("--accent-glow", hexToRgba(color, 0.25));
        document.documentElement.style.setProperty("--accent-soft", hexToRgba(color, 0.12));
        document.documentElement.style.setProperty("--accent-text", lightenHex(color, 30));
    }

    function applyFontSize(size) {
        if (size) {
            document.documentElement.style.fontSize = size + "px";
        } else {
            document.documentElement.style.fontSize = "";
        }
    }

    function applyReduceMotion(enabled) {
        var existing = document.getElementById("reduce-motion-style");
        if (enabled) {
            document.documentElement.style.setProperty("--transition-theme", "0s");
            if (!existing) {
                var style = document.createElement("style");
                style.id = "reduce-motion-style";
                style.textContent = "*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; animation-iteration-count: 1 !important; }";
                document.head.appendChild(style);
            }
        } else {
            document.documentElement.style.setProperty("--transition-theme", "0.35s cubic-bezier(0.4, 0, 0.2, 1)");
            if (existing) existing.remove();
        }
    }

    function applyAmbientOrbs(enabled) {
        var orbs = document.querySelector(".ambient");
        if (!orbs) return;

        orbs.style.display = enabled === false ? "none" : "block";
        orbs.style.opacity = enabled === false ? "0" : "1";
    }

    function applyGlobalPreferences() {
        var prefs = getPrefs();
        applyTheme(prefs.theme || "system");
        applyAccent(prefs.accent);
        applyFontSize(prefs.fontSizeRange);
        applyReduceMotion(prefs.reduceMotion);
        applyAmbientOrbs(prefs.prefAmbientOrbs);
    }

    function bindSystemThemeListener() {
        var mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        var handler = function () {
            if ((getPrefs().theme || "system") === "system") {
                applyGlobalPreferences();
            }
        };

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", handler);
        } else if (typeof mediaQuery.addListener === "function") {
            mediaQuery.addListener(handler);
        }
    }

    applyGlobalPreferences();
    bindSystemThemeListener();

    // ── Global Entrance Animations ──────────────────────────
    function initGlobalAnimations() {
        const animatedElements = document.querySelectorAll('[data-animate]');
        
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const delay = parseInt(el.getAttribute('data-delay') || '0', 10);
                    
                    if (delay > 0) {
                        setTimeout(() => {
                            el.classList.add('visible');
                            el.style.visibility = 'visible';
                        }, delay);
                    } else {
                        el.classList.add('visible');
                        el.style.visibility = 'visible';
                    }
                    
                    observer.unobserve(el);
                }
            });
        }, observerOptions);

        animatedElements.forEach(el => {
            // Ensure elements are hidden before animation starts if they aren't already
            if (!el.classList.contains('visible')) {
                el.style.visibility = 'hidden';
            }
            observer.observe(el);
        });
    }

    // ── Hero Particle Animation ─────────────────────────────
    function initHeroParticles() {
        var canvas = document.getElementById("heroParticles");
        if (!canvas) return;

        var ctx = canvas.getContext("2d");
        if (!ctx) return;

        var hero = canvas.closest("section") || canvas.parentElement;
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        var width = 0;
        var height = 0;
        var animationFrame = 0;
        var particles = [];
        var pointer = { x: 0, y: 0, active: false };
        
        function prefersReducedMotion() {
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!document.getElementById("reduce-motion-style");
        }

        var theme = readThemePalette();
        var reducedMotion = prefersReducedMotion();

        function readThemePalette() {
            var styles = getComputedStyle(document.documentElement);
            var isDark = document.documentElement.getAttribute("data-theme") === "dark";
            
            return {
                dot: styles.getPropertyValue("--home-particle-dot").trim() || (isDark ? "rgba(255,255,255,0.72)" : "rgba(31, 41, 55, 0.4)"),
                line: styles.getPropertyValue("--home-particle-line").trim() || (isDark ? "rgba(108,99,255,0.22)" : "rgba(108,99,255,0.1)"),
                accent: styles.getPropertyValue("--home-particle-connection").trim() || (isDark ? "rgba(45,212,191,0.2)" : "rgba(45,212,191,0.1)"),
            };
        }

        function random(min, max) {
            return min + Math.random() * (max - min);
        }

        function buildParticles() {
            var area = width * height;
            var count = Math.max(34, Math.min(82, Math.round(area / 16000)));
            particles = [];

            for (var index = 0; index < count; index += 1) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: random(-0.24, 0.24),
                    vy: random(-0.22, 0.22),
                    radius: random(0.9, 2.1),
                });
            }
        }

        function resize() {
            if (!hero) return;
            var rect = hero.getBoundingClientRect();
            width = Math.max(320, rect.width);
            height = Math.max(400, rect.height); // Adjusted for smaller heroes
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            buildParticles();
            drawFrame(true);
        }

        function drawConnections() {
            var maxDistance = width < 760 ? 94 : 120;

            for (var first = 0; first < particles.length; first += 1) {
                for (var second = first + 1; second < particles.length; second += 1) {
                    var a = particles[first];
                    var b = particles[second];
                    var dx = a.x - b.x;
                    var dy = a.y - b.y;
                    var distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > maxDistance) continue;

                    var strength = 1 - distance / maxDistance;
                    ctx.strokeStyle = withAlpha(theme.line, strength * 0.95);
                    ctx.lineWidth = strength * 1.2;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        function withAlpha(color, alpha) {
            if (color.slice(0, 4) !== "rgba") return color;
            return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, function (_match, r, g, b) {
                return "rgba(" + r.trim() + "," + g.trim() + "," + b.trim() + "," + alpha.toFixed(3) + ")";
            });
        }

        function drawPointerConnections() {
            if (!pointer.active) return;

            particles.forEach(function (particle) {
                var dx = pointer.x - particle.x;
                var dy = pointer.y - particle.y;
                var distance = Math.sqrt(dx * dx + dy * dy);
                var radius = 130;
                if (distance > radius) return;

                var strength = 1 - distance / radius;
                ctx.strokeStyle = withAlpha(theme.accent, strength);
                ctx.lineWidth = strength * 1.5;
                ctx.beginPath();
                ctx.moveTo(pointer.x, pointer.y);
                ctx.lineTo(particle.x, particle.y);
                ctx.stroke();
            });
        }

        function stepParticles() {
            particles.forEach(function (particle) {
                particle.x += particle.vx;
                particle.y += particle.vy;

                if (particle.x < -20) particle.x = width + 20;
                if (particle.x > width + 20) particle.x = -20;
                if (particle.y < -20) particle.y = height + 20;
                if (particle.y > height + 20) particle.y = -20;
            });
        }

        function drawDots() {
            particles.forEach(function (particle) {
                ctx.fillStyle = theme.dot;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        function drawFrame(skipStep) {
            ctx.clearRect(0, 0, width, height);
            if (!skipStep) stepParticles();
            drawConnections();
            drawPointerConnections();
            drawDots();
        }

        function loop() {
            if (!reducedMotion) drawFrame(false);
            animationFrame = window.requestAnimationFrame(loop);
        }

        function handlePointerMove(event) {
            var rect = hero.getBoundingClientRect();
            pointer.x = event.clientX - rect.left;
            pointer.y = event.clientY - rect.top;
            pointer.active = true;

            if (reducedMotion) drawFrame(true);
        }

        function handlePointerLeave() {
            pointer.active = false;
            if (reducedMotion) drawFrame(true);
        }

        function handleThemeMutation() {
            theme = readThemePalette();
            reducedMotion = prefersReducedMotion();

            if (reducedMotion) {
                if (animationFrame) {
                    window.cancelAnimationFrame(animationFrame);
                    animationFrame = 0;
                }
                drawFrame(true);
                return;
            }

            if (!animationFrame) loop();
        }

        resize();

        hero.addEventListener("pointermove", handlePointerMove);
        hero.addEventListener("pointerleave", handlePointerLeave);
        window.addEventListener("resize", resize);
        window.addEventListener("focus", handleThemeMutation);
        window.addEventListener("storage", handleThemeMutation);

        var observer = new MutationObserver(handleThemeMutation);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

        if (reducedMotion) {
            drawFrame(true);
        } else {
            loop();
        }
    }

    // ── Hero Parallax ──────────────────────────────────────
    function initHeroParallax() {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        var stages = document.querySelectorAll("#visualStage, .hero-parallax-container");
        stages.forEach(function(stage) {
            var layers = stage.querySelectorAll("[data-parallax]");
            if (!layers.length) return;

            var active = false;

            function reset() {
                layers.forEach(function (layer) {
                    layer.style.transform = "";
                });
                active = false;
            }

            stage.addEventListener("pointermove", function (event) {
                var rect = stage.getBoundingClientRect();
                var offsetX = event.clientX - rect.left;
                var offsetY = event.clientY - rect.top;
                var percentX = offsetX / rect.width - 0.5;
                var percentY = offsetY / rect.height - 0.5;
                active = true;

                layers.forEach(function (layer) {
                    var distance = Number(layer.getAttribute("data-parallax")) || 0;
                    var translateX = percentX * distance * 2;
                    var translateY = percentY * distance * 1.3;
                    layer.style.transform = "translate3d(" + translateX.toFixed(1) + "px, " + translateY.toFixed(1) + "px, 0)";
                });
            });

            stage.addEventListener("pointerleave", reset);
            window.addEventListener("blur", function () {
                if (active) reset();
            });
        });
    }

    // ── Nav Dropdown ───────────────────────────────────────
    function initNavDropdown() {
        var trigger = document.getElementById("navUserEmail");
        var menu = document.getElementById("userDropdownMenu");
        if (!trigger || !menu) return;

        function closeMenu() {
            menu.classList.remove("show");
            trigger.setAttribute("aria-expanded", "false");
        }

        trigger.addEventListener("click", function (event) {
            event.stopPropagation();
            var willOpen = !menu.classList.contains("show");
            menu.classList.toggle("show", willOpen);
            trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });

        menu.addEventListener("click", function (event) {
            event.stopPropagation();
        });

        document.addEventListener("click", closeMenu);
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") closeMenu();
        });
    }

    // ── Intro Loader Controller ───────────────────────────
    function initIntroLoader() {
        var loader = document.getElementById("introLoader");
        if (!loader) return;

        var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var duration = reducedMotion ? 1200 : 2800; // Shorter for reduced motion

        setTimeout(function() {
            loader.classList.add("intro-loader--hidden");
            
            // Cleanup from DOM after transition
            setTimeout(function() {
                loader.remove();
            }, 800);
        }, duration);
    }

    window.addEventListener("storage", function (event) {
        if (event.key === PREFS_KEY || event.key === THEME_KEY || event.key === "preploom_theme") {
            applyGlobalPreferences();
        }
    });

    document.addEventListener("DOMContentLoaded", function() {
        applyGlobalPreferences();
        initGlobalAnimations();
        initHeroParticles();
        initHeroParallax();
        initNavDropdown();
        initIntroLoader();
    });

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

(function () {
    function openModal(id) {
        document.querySelectorAll(".modal-overlay.is-open").forEach(function (overlay) {
            closeModal(overlay);
        });

        var element = document.getElementById(id);
        if (!element) return;

        element.classList.add("is-open");
        element.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeModal(element) {
        if (!element || !element.classList.contains("modal-overlay")) return;

        element.classList.remove("is-open");
        element.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    document.addEventListener("click", function (event) {
        var openButton = event.target.closest("[data-open-modal]");
        if (openButton) {
            openModal(openButton.getAttribute("data-open-modal"));
            return;
        }

        var closeButton = event.target.closest("[data-close-modal]");
        if (closeButton) {
            closeModal(closeButton.closest(".modal-overlay"));
            return;
        }

        if (event.target.classList.contains("modal-overlay")) {
            closeModal(event.target);
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".modal-overlay.is-open").forEach(closeModal);
    });
})();

function toggleTheme() {
    if (typeof PrepLoom !== "undefined") {
        PrepLoom.toggleTheme();
    }
}
