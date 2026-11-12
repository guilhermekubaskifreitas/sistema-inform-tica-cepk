(function () {
  "use strict";

  var STORAGE_KEY = "cepk_theme";
  var root = document.documentElement;

  function preferredTheme() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (error) {}
    return "light";
  }

  function apply(theme) {
    var next = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    var button = document.getElementById("theme-toggle");
    if (button) {
      button.setAttribute("aria-label", next === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
      button.setAttribute("title", next === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
    }
    return next;
  }

  function createButton() {
    if (document.getElementById("theme-toggle")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.innerHTML =
      '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg>' +
      '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';
    button.addEventListener("click", function () {
      apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    document.body.appendChild(button);
    button.setAttribute("aria-label", root.getAttribute("data-theme") === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
    button.setAttribute("title", root.getAttribute("data-theme") === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
  }

  apply(preferredTheme());

  window.CEPKTheme = {
    set: apply,
    toggle: function () {
      return apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButton);
  } else {
    createButton();
  }
})();
