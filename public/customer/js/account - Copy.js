(function () {
  "use strict";

  const layout =
    document.getElementById("accountLayout") ||
    document.getElementById("accountShell");

  const sidebar = document.getElementById("accountSidebar");
  const toggleBtns = document.querySelectorAll(
    "#accountToggleBtn, #sidebarToggle, .sidebar-toggle, .account-sidebar-toggle"
  );

  const backdrop =
    document.getElementById("accountBackdrop") ||
    document.getElementById("accountSidebarBackdrop") ||
    document.getElementById("sidebarBackdrop") ||
    document.querySelector(".account-backdrop") ||
    document.querySelector(".account-sidebar-backdrop") ||
    document.querySelector(".account-sidebar-overlay");

  const toast = document.getElementById("saveToast");
  const profileBtn = document.getElementById("btnFocusProfile");

  const inputs = Array.from(document.querySelectorAll(".js-editable"));
  const editButtons = Array.from(document.querySelectorAll(".js-edit-btn"));

  const STORAGE_KEY = "accountSidebarState";

  const BREAKPOINTS = {
    mobile: 767,
    tablet: 1199,
  };

  function isMobile() {
    return window.innerWidth <= BREAKPOINTS.mobile;
  }

  function isTablet() {
    return window.innerWidth > BREAKPOINTS.mobile && window.innerWidth <= BREAKPOINTS.tablet;
  }

  function isDesktop() {
    return window.innerWidth > BREAKPOINTS.tablet;
  }

  function showToast(message, error = false) {
    if (!toast) return;

    toast.textContent = message;
    toast.style.background = error
      ? "rgba(127,29,29,.96)"
      : "rgba(15,23,42,.95)";

    toast.classList.add("show");

    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);
  }

  function setEditable(el, enabled) {
    if (!el) return;

    el.readOnly = !enabled;

    if (enabled) {
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch (_) {}
    }
  }

  async function saveField(input) {
    const url = input.dataset.updateUrl || "/customer/account/update";
    const field = input.dataset.field || input.name || input.id;
    const value = input.value;

    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ field, value }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "Save failed");
      }

      showToast(data.message || "Saved successfully");
      return true;
    } catch (err) {
      showToast(err.message || "Error saving", true);
      return false;
    }
  }

  function openMobileSidebar() {
    if (!sidebar) return;
    sidebar.classList.add("open");
    backdrop?.classList.add("show");
    document.body.classList.add("sidebar-lock");
  }

  function closeMobileSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove("open");
    backdrop?.classList.remove("show");
    document.body.classList.remove("sidebar-lock");
  }

  function getSavedState() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function setSavedState(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  }

  function clearStateClasses() {
    if (layout) {
      layout.classList.remove("sidebar-collapsed", "sidebar-expanded");
    }

    if (sidebar) {
      sidebar.classList.remove("collapsed", "expanded", "open");
    }

    backdrop?.classList.remove("show");
    document.body.classList.remove("sidebar-lock");
  }

  function applyLayoutState() {
    if (!sidebar) return;

    clearStateClasses();

    const saved = getSavedState();

    if (isMobile()) {
      return;
    }

    if (isTablet()) {
      sidebar.classList.add("collapsed");

      if (saved === "expanded") {
        sidebar.classList.remove("collapsed");
        sidebar.classList.add("expanded");
        layout?.classList.add("sidebar-expanded");
      }

      return;
    }

    if (isDesktop()) {
      if (saved === "collapsed") {
        sidebar.classList.add("collapsed");
        layout?.classList.add("sidebar-collapsed");
      }
    }
  }

  function toggleSidebar() {
    if (!sidebar) return;

    if (isMobile()) {
      if (sidebar.classList.contains("open")) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
      return;
    }

    if (isTablet()) {
      const expanded = sidebar.classList.toggle("expanded");
      sidebar.classList.toggle("collapsed", !expanded);
      layout?.classList.toggle("sidebar-expanded", expanded);
      setSavedState(expanded ? "expanded" : "collapsed");
      return;
    }

    if (isDesktop()) {
      const collapsed = sidebar.classList.toggle("collapsed");
      layout?.classList.toggle("sidebar-collapsed", collapsed);
      setSavedState(collapsed ? "collapsed" : "expanded");
    }
  }

  editButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      setEditable(target, true);
    });
  });

  inputs.forEach((input) => {
    input.addEventListener("focus", () => {
      input.dataset.prev = input.value;
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.tagName !== "TEXTAREA") {
        e.preventDefault();
        input.blur();
      }

      if (e.key === "Escape") {
        input.value = input.dataset.prev || input.value;
        input.blur();
      }
    });

    input.addEventListener("blur", async () => {
      if (input.readOnly === false) {
        input.readOnly = true;

        const prev = input.dataset.prev || "";

        if (input.value !== prev) {
          await saveField(input);
        }
      }
    });
  });

  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      const el = document.getElementById("full_name");
      if (el) setEditable(el, true);
    });
  }

  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", toggleSidebar);
  });

  backdrop?.addEventListener("click", closeMobileSidebar);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobile()) {
      closeMobileSidebar();
    }
  });

  window.addEventListener("resize", applyLayoutState);

  applyLayoutState();
})();