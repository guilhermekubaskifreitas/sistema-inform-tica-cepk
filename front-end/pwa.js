/* ==========================================================================
   CEPK PWA — registra o service worker e mostra o botao "Instalar o app"
   na primeira tela (login). O clique abre a instalacao NATIVA do navegador.
   ========================================================================== */
(function () {
  "use strict";

  var deferredPrompt = null;
  var installed = false;

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
    } catch (error) {}
    return window.navigator.standalone === true;
  }

  function isIos() {
    var ua = window.navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  }

  function isSafari() {
    var ua = window.navigator.userAgent || "";
    return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in window.navigator)) return;
    if (window.location.protocol !== "https:") return;
    if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;
    window.navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  var ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg>';

  function hintText() {
    if (isIos()) {
      return "<strong>Instalar no iPhone/iPad:</strong> toque em <strong>Compartilhar</strong> (quadro com seta para cima) e depois em <strong>Adicionar à Tela de Início</strong>.";
    }
    return "<strong>Instalar no navegador:</strong> clique no ícone de instalar (⊕) ao lado da barra de endereço ou no menu <strong>⋮</strong> → <strong>Instalar aplicação</strong>.";
  }

  function buildButton() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "install-btn";
    button.id = "install-app";
    button.innerHTML =
      ICON +
      "<span><strong>Instalar o app</strong><small>Use no celular como aplicativo</small></span>";
    return button;
  }

  function showHint(slot, message) {
    var hint = slot.querySelector(".install-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "install-hint";
      slot.appendChild(hint);
    }
    hint.innerHTML = message;
    hint.hidden = false;
  }

  function render() {
    var slots = document.querySelectorAll("[data-install-slot]");
    if (!slots.length) return;

    var show = !installed && !isStandalone();

    Array.prototype.forEach.call(slots, function (slot) {
      if (!show) {
        slot.innerHTML = "";
        return;
      }
      if (slot.querySelector(".install-btn")) return;
      var button = buildButton();
      button.addEventListener("click", function () {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice
            .then(function () { deferredPrompt = null; })
            .catch(function () {});
          return;
        }
        showHint(slot, hintText());
      });
      slot.appendChild(button);
    });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    render();
  });

  window.addEventListener("appinstalled", function () {
    installed = true;
    deferredPrompt = null;
    render();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      registerServiceWorker();
      render();
    });
  } else {
    registerServiceWorker();
    render();
  }

  window.CEPKPwa = {
    install: function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        return true;
      }
      return false;
    }
  };
})();
