const App = (() => {
  let currentView = 'dashboard';
  const views = {
    dashboard: DashboardView,
    accounts: AccountsView,
    trends: TrendsView,
    goals: GoalsView,
    upload: UploadView
  };

  const main = () => document.getElementById('main-content');
  const subtitle = () => document.getElementById('header-subtitle');

  function navigate(viewName) {
    currentView = viewName;
    document.querySelectorAll('nav.tabbar button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    rerender();
  }

  function rerender() {
    const view = views[currentView];
    main().innerHTML = view.render();
    view.afterRender();
  }

  function openModal(html) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal-sheet">${html}</div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.body.appendChild(backdrop);
  }

  function closeModal() {
    document.getElementById('modal-backdrop')?.remove();
  }

  function showSaving() {
    subtitle().textContent = 'Saving...';
  }

  async function init() {
    document.querySelectorAll('nav.tabbar button').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });

    subtitle().textContent = 'Loading your data...';
    await Store.loadAll();
    subtitle().textContent = `Updated ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    rerender();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  return { navigate, rerender, openModal, closeModal, showSaving, init };
})();

window.addEventListener('DOMContentLoaded', App.init);
