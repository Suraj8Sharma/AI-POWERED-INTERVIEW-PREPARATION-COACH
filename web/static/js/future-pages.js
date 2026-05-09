(function () {
    function prefersReducedMotion() {
        return (
            window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
            !!document.getElementById("reduce-motion-style")
        );
    }

    function bindThemeToggle() {
        var themeToggle = document.getElementById("themeToggle");
        if (!themeToggle || themeToggle.dataset.bound === "true") return;
        themeToggle.dataset.bound = "true";
        themeToggle.addEventListener("click", toggleTheme);
    }

    function bindNavDropdown() {
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

    function bindSmoothAnchors() {
        document.querySelectorAll('a[href^="#"]').forEach(function (link) {
            link.addEventListener("click", function (event) {
                var targetSelector = link.getAttribute("href");
                if (!targetSelector || targetSelector === "#") return;
                var target = document.querySelector(targetSelector);
                if (!target) return;

                event.preventDefault();
                target.scrollIntoView({
                    behavior: prefersReducedMotion() ? "auto" : "smooth",
                    block: "start"
                });
            });
        });
    }

    function init() {
        bindThemeToggle();
        bindNavDropdown();
        bindSmoothAnchors();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
