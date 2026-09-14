(() => {
  'use strict';

  if (window.__PMD_BUTTON_FEEDBACK__) return;
  window.__PMD_BUTTON_FEEDBACK__ = true;

  const SELECTOR = 'button, a.btn, a.iconBtn, a.refreshBtn, a.backBtn, [role="button"], summary';

  function installStyles() {
    if (document.getElementById('pmd-button-feedback-style')) return;
    const style = document.createElement('style');
    style.id = 'pmd-button-feedback-style';
    style.textContent = `
      ${SELECTOR} {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: transform .08s ease, filter .08s ease, box-shadow .08s ease, opacity .08s ease;
      }
      .pmd-pressed {
        transform: translateY(1px) scale(.965) !important;
        filter: brightness(.82) !important;
        box-shadow: inset 0 2px 6px rgba(0,0,0,.24) !important;
      }
      .pmd-confirm {
        animation: pmdButtonConfirm .34s ease-out;
      }
      .pmd-busy {
        cursor: wait !important;
        opacity: .78 !important;
      }
      @keyframes pmdButtonConfirm {
        0% { filter: brightness(.82); }
        45% { filter: brightness(1.14); }
        100% { filter: brightness(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        ${SELECTOR} { transition: none; }
        .pmd-confirm { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function getButton(target) {
    return target && target.closest ? target.closest(SELECTOR) : null;
  }

  function isDisabled(el) {
    return !el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');
  }

  function press(el) {
    if (isDisabled(el)) return;
    el.classList.add('pmd-pressed');
  }

  function release(el) {
    if (!el) return;
    el.classList.remove('pmd-pressed');
  }

  function confirm(el) {
    if (isDisabled(el)) return;
    el.classList.remove('pmd-confirm');
    void el.offsetWidth;
    el.classList.add('pmd-confirm');
    setTimeout(() => el.classList.remove('pmd-confirm'), 360);
  }

  function bindEvents() {
    if ('PointerEvent' in window) {
      document.addEventListener('pointerdown', e => press(getButton(e.target)), true);
      document.addEventListener('pointerup', e => release(getButton(e.target)), true);
      document.addEventListener('pointercancel', e => release(getButton(e.target)), true);
      document.addEventListener('pointerleave', e => release(getButton(e.target)), true);
    } else {
      document.addEventListener('touchstart', e => press(getButton(e.target)), {capture:true, passive:true});
      document.addEventListener('touchend', e => release(getButton(e.target)), true);
      document.addEventListener('touchcancel', e => release(getButton(e.target)), true);
      document.addEventListener('mousedown', e => press(getButton(e.target)), true);
      document.addEventListener('mouseup', e => release(getButton(e.target)), true);
    }

    document.addEventListener('click', e => confirm(getButton(e.target)), true);
  }

  window.pmdSetButtonBusy = (buttonOrSelector, busy, busyLabel) => {
    const el = typeof buttonOrSelector === 'string'
      ? document.querySelector(buttonOrSelector)
      : buttonOrSelector;
    if (!el) return;

    if (busy) {
      if (!Object.prototype.hasOwnProperty.call(el.dataset, 'pmdOriginalHtml')) {
        el.dataset.pmdOriginalHtml = el.innerHTML;
      }
      el.classList.add('pmd-busy');
      el.setAttribute('aria-busy', 'true');
      if ('disabled' in el) el.disabled = true;
      if (busyLabel) el.textContent = busyLabel;
    } else {
      el.classList.remove('pmd-busy');
      el.removeAttribute('aria-busy');
      if ('disabled' in el) el.disabled = false;
      if (Object.prototype.hasOwnProperty.call(el.dataset, 'pmdOriginalHtml')) {
        el.innerHTML = el.dataset.pmdOriginalHtml;
        delete el.dataset.pmdOriginalHtml;
      }
    }
  };

  installStyles();
  bindEvents();
})();
