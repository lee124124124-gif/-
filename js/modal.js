const ModalUI = (() => {
  const overlay = () => document.getElementById('modal-overlay');
  const content = () => document.getElementById('modal-content');

  function open(html, extraClass) {
    content().className = 'modal-content' + (extraClass ? ' ' + extraClass : '');
    content().innerHTML = html;
    overlay().classList.add('active');
    content().querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', close);
    });
  }

  function close() {
    overlay().classList.remove('active');
    content().innerHTML = '';
  }

  function init() {
    overlay().addEventListener('click', (e) => {
      if (e.target === overlay()) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  return { open, close, init };
})();
