/**
 * PrepLoom — marketing pages: auth modals (UI only).
 */
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
