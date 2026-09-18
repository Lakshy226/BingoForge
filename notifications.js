/**
 * notifications.js
 * -----------------------------------------------------------------------
 * A small, reusable toast system. One function call = one toast.
 * Types: 'info' | 'success' | 'warning' | 'error' | 'achievement'
 * -----------------------------------------------------------------------
 */

const Notifications = (() => {
  const REGION_ID = "toast-region";
  const DEFAULT_DURATION = 3600;

  function getRegion() {
    return document.getElementById(REGION_ID);
  }

  function show(message, { type = "info", duration = DEFAULT_DURATION } = {}) {
    const region = getRegion();
    if (!region) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = message;
    region.appendChild(toast);

    const remove = () => {
      toast.style.transition = "opacity 180ms ease, transform 180ms ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      setTimeout(() => toast.remove(), 200);
    };

    const timer = setTimeout(remove, duration);
    toast.addEventListener("click", () => {
      clearTimeout(timer);
      remove();
    });

    return toast;
  }

  return {
    show,
    success: (msg, opts) => show(msg, { ...opts, type: "success" }),
    warning: (msg, opts) => show(msg, { ...opts, type: "warning" }),
    error: (msg, opts) => show(msg, { ...opts, type: "error" }),
    info: (msg, opts) => show(msg, { ...opts, type: "info" }),
    achievement: (msg, opts) => show(msg, { ...opts, type: "achievement", duration: 4200 }),
  };
})();
