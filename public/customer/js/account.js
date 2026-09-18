(function () {
  const sidebar = document.getElementById('accountSidebar');
  const toggleBtn = document.getElementById('accountToggleBtn');
  const backdrop = document.getElementById('accountBackdrop');
  const layout = document.getElementById('accountLayout');

  if (!sidebar || !toggleBtn || !layout) return;

  const MOBILE = 991;
  const TABLET = 1200;

  const mode = () => window.innerWidth <= MOBILE ? 'mobile'
               : window.innerWidth <= TABLET ? 'tablet'
               : 'desktop';

  function closeMobile() {
    sidebar.classList.remove('open');
    backdrop?.classList.remove('show');
    document.body.style.overflow = '';
  }

  function apply() {
    closeMobile();
    layout.classList.remove('sidebar-collapsed');
    sidebar.classList.remove('collapsed');

    if (mode() === 'tablet') {
      layout.classList.add('sidebar-collapsed');
      sidebar.classList.add('collapsed');
    }
  }

  toggleBtn.addEventListener('click', () => {
    if (mode() === 'mobile') {
      const open = sidebar.classList.toggle('open');
      backdrop?.classList.toggle('show', open);
      document.body.style.overflow = open ? 'hidden' : '';
      return;
    }

    const collapsed = layout.classList.toggle('sidebar-collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
  });

  backdrop?.addEventListener('click', closeMobile);

  window.addEventListener('resize', apply);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobile();
  });

  // apply layout first
  apply();

  // ✅ FIX: close sidebar on nav click (mobile only)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.account-nav-link');
    if (link && mode() === 'mobile') {
      closeMobile();
    }
  });
  const closeBtn = document.getElementById('accountSidebarClose');

function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop?.classList.remove('show');
  document.body.style.overflow = '';
}

// cross button click
closeBtn?.addEventListener('click', closeSidebar);

})();