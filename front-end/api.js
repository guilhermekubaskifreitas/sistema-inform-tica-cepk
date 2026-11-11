(function () {
  "use strict";

  var API_KEY = "cepk_api_base";
  var TOKEN_KEY = "cepk_access_token";
  var USER_KEY = "cepk_user";
  var LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  var DEFAULT_BASE = LOCAL_HOST ? "http://localhost:3000" : "https://cepk-api.onrender.com";
  var FALLBACK_BASE = "https://backend-informatica-cepk.onrender.com";
  var FALLBACK_KEY = "cepk_api_fallback_until";
  var FALLBACK_TTL = 10 * 60 * 1000;
  var LEGACY_BASES = [
    /^https?:\/\/backend-informatica-cepk\.onrender\.com$/i,
    /^https?:\/\/cepk-mock\.onrender\.com$/i
  ];

  function normalizeBase(value) {
    var base = String(value || "").trim().replace(/\/+$/, "");
    if (LEGACY_BASES.some(function (pattern) { return pattern.test(base); })) {
      base = DEFAULT_BASE;
    }
    return base;
  }

  function apiBase() {
    var stored = normalizeBase(localStorage.getItem(API_KEY));
    if (stored) return stored;

    try {
      var param = new URLSearchParams(window.location.search).get("api");
      if (param) {
        stored = normalizeBase(param);
        localStorage.setItem(API_KEY, stored);
        return stored;
      }
    } catch (error) {}

    return DEFAULT_BASE;
  }

  function setBase(value) {
    var next = normalizeBase(value);
    if (next) localStorage.setItem(API_KEY, next);
    return next || apiBase();
  }

  function fallbackActive() {
    if (LOCAL_HOST) return false;
    var until = Number(sessionStorage.getItem(FALLBACK_KEY) || 0);
    return until > Date.now();
  }

  function markFallback() {
    sessionStorage.setItem(FALLBACK_KEY, String(Date.now() + FALLBACK_TTL));
  }

  function activeBase() {
    return fallbackActive() ? FALLBACK_BASE : apiBase();
  }

  function shouldFallback(base, result) {
    if (LOCAL_HOST || base !== DEFAULT_BASE) return false;
    return result.status === 404 || result.status === 502 || result.status === 503 || result.status === 504;
  }

  function readValue(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  function writeValue(key, value, remember) {
    var target = remember ? localStorage : sessionStorage;
    var other = remember ? sessionStorage : localStorage;
    target.setItem(key, value);
    other.removeItem(key);
  }

  function token() {
    return readValue(TOKEN_KEY);
  }

  function user() {
    try {
      return JSON.parse(readValue(USER_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveSession(data, remember) {
    if (!data) return;
    if (data.accessToken) writeValue(TOKEN_KEY, data.accessToken, remember);
    if (data.user) {
      writeValue(USER_KEY, JSON.stringify(data.user), remember);
      writeValue("cepk_user_name", data.user.name || "", remember);
      writeValue("cepk_user_email", data.user.email || "", remember);
      writeValue("cepk_user_role", data.user.role || "", remember);
      writeValue("cepk_user_subject", Array.isArray(data.user.subjects) ? data.user.subjects.join(", ") : "", remember);
    }
  }

  function clearSession() {
    [localStorage, sessionStorage].forEach(function (storage) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
      storage.removeItem("cepk_user_name");
      storage.removeItem("cepk_user_email");
      storage.removeItem("cepk_user_subject");
      storage.removeItem("cepk_user_role");
    });
  }

  async function send(base, path, opts) {
    try {
      var response = await fetch(base + path, opts);
      var data = null;

      try {
        data = await response.json();
      } catch (error) {}

      if (response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
        clearSession();
      }

      return { ok: response.ok, status: response.status, data: data };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: { error: "Não foi possível conectar ao servidor. Verifique se a API está ligada." }
      };
    }
  }

  async function request(path, options) {
    var opts = Object.assign({ credentials: "include" }, options || {});
    var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});

    if (opts.body && typeof opts.body !== "string") {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }

    var currentToken = token();
    if (currentToken) headers.Authorization = "Bearer " + currentToken;
    opts.headers = headers;

    var base = activeBase();
    var result = await send(base, path, opts);

    if (shouldFallback(base, result)) {
      var fallbackResult = await send(FALLBACK_BASE, path, opts);
      if (fallbackResult.status !== 0) {
        markFallback();
        console.warn("API principal indisponível; usando contingência temporária.");
        return fallbackResult;
      }
    }

    return result;
  }

  function register(payload) {
    return request("/auth/register", { method: "POST", body: payload });
  }

  function login(payload) {
    return request("/auth/login", { method: "POST", body: payload });
  }

  function refresh() {
    return request("/auth/refresh", { method: "POST" });
  }

  function logout() {
    return request("/auth/logout", { method: "POST" });
  }

  function me() {
    return request("/auth/me");
  }

  function catalog() {
    return request("/catalog");
  }

  function createReservation(payload) {
    return request("/reservations", { method: "POST", body: payload });
  }

  function reservations() {
    return request("/reservations");
  }

  function approveReservation(id, payload) {
    return request("/reservations/" + encodeURIComponent(id) + "/approve", {
      method: "POST",
      body: payload || {}
    });
  }

  function rejectReservation(id, payload) {
    return request("/reservations/" + encodeURIComponent(id) + "/reject", {
      method: "POST",
      body: payload || {}
    });
  }

  function formatReservationDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    var day = ("0" + date.getDate()).slice(-2);
    var month = ("0" + (date.getMonth() + 1)).slice(-2);
    return day + "/" + month + "/" + date.getFullYear();
  }

  function normalizeReservation(reservation) {
    var source = reservation || {};
    var disciplinas = Array.isArray(source.disciplinas)
      ? source.disciplinas.map(String).filter(Boolean)
      : String(source.disciplina || "").split(/[,;\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
    var dias = Array.isArray(source.dias)
      ? source.dias.map(String).filter(Boolean)
      : String(source.dia || "").split(/[,;\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
    var aulas = Array.isArray(source.aulas)
      ? source.aulas.map(String).filter(Boolean)
      : String(source.aula || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
    return Object.assign({}, source, {
      disciplinas: disciplinas,
      disciplina: source.disciplina || disciplinas.join(", "),
      dias: dias,
      dia: source.dia || dias.join(", "),
      aulas: aulas,
      aula: source.aula || aulas.join(","),
      status: String(source.status || "pendente").toLowerCase(),
      criadaEm: source.criadaEm || formatReservationDate(source.createdAt)
    });
  }

  function reservationKey(reservation) {
    var item = normalizeReservation(reservation);
    return [
      item.lab || "",
      item.dias.join(","),
      item.turno || "",
      item.aulas.join(",")
    ].join("|");
  }

  function mergeReservations(localReservations, apiReservations) {
    var merged = (apiReservations || []).map(normalizeReservation);
    (localReservations || []).map(normalizeReservation).forEach(function (local) {
      var index = merged.findIndex(function (item) {
        return (local.id && item.id === local.id) || reservationKey(item) === reservationKey(local);
      });
      if (index >= 0) {
        merged[index] = Object.assign({}, local, merged[index]);
        merged[index].id = merged[index].id || local.id;
      } else {
        merged.push(local);
      }
    });
    return merged;
  }

  function approvalUrl(approvalToken, action) {
    return activeBase() + "/auth/approval?token=" + encodeURIComponent(approvalToken) + "&action=" + encodeURIComponent(action || "approve");
  }

  function errorMessage(result, fallback) {
    if (result && result.data && result.data.error) return result.data.error;
    if (result && result.data && result.data.issues && result.data.issues.fieldErrors) {
      var fields = result.data.issues.fieldErrors;
      var first = Object.keys(fields).map(function (key) { return fields[key] && fields[key][0]; }).filter(Boolean)[0];
      if (first) return first;
    }
    if (result && result.data && Array.isArray(result.data.details) && result.data.details[0]) {
      return result.data.details[0].message || fallback;
    }
    return fallback || "Não foi possível concluir a operação.";
  }

  window.CEPKApi = {
    apiBase: apiBase,
    setBase: setBase,
    token: token,
    user: user,
    saveSession: saveSession,
    clearSession: clearSession,
    request: request,
    register: register,
    login: login,
    refresh: refresh,
    logout: logout,
    me: me,
    catalog: catalog,
    createReservation: createReservation,
    reservations: reservations,
    approveReservation: approveReservation,
    rejectReservation: rejectReservation,
    normalizeReservation: normalizeReservation,
    mergeReservations: mergeReservations,
    approvalUrl: approvalUrl,
    errorMessage: errorMessage
  };
})();
