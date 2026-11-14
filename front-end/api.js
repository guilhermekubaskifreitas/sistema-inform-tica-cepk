(function () {
  "use strict";

  var API_KEY = "cepk_api_base_v2";
  var TOKEN_KEY = "cepk_access_token";
  var USER_KEY = "cepk_user";
  var LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  // Candidatas: a API real (Node + Prisma + Neon) tem prioridade; o mock fica de reserva.
  var DEFAULT_BASE = LOCAL_HOST ? "http://localhost:3000" : "https://cepk-api-96uq.onrender.com";
  var FALLBACK_BASE = "https://backend-informatica-cepk.onrender.com";
  var CANDIDATE_BASES = LOCAL_HOST
    ? ["http://localhost:3000"]
    : [
        "https://cepk-api-96uq.onrender.com",
        "https://cepk-api.onrender.com",
        FALLBACK_BASE
      ];
  var PROBE_KEY = "cepk_api_probe_v2";
  var PROBE_TTL = 30 * 60 * 1000;
  var FALLBACK_KEY = "cepk_api_last_good_v1";
  var FALLBACK_TTL = 10 * 60 * 1000;
  var REQUEST_TIMEOUT = 15000;
  var DEAD_STATUS = [0, 404, 502, 503, 504];
  var LEGACY_BASES = [
    /^https?:\/\/cepk-mock\.onrender\.com$/i
  ];
  var resolvedBase = "";
  var probePromise = null;

  function normalizeBase(value) {
    var base = String(value || "").trim().replace(/\/+$/, "");
    if (LEGACY_BASES.some(function (pattern) { return pattern.test(base); })) {
      base = DEFAULT_BASE;
    }
    return base;
  }

  function apiBase() {
    clearOldBase();
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
    clearLastGood();
    resolvedBase = next || "";
    try {
      localStorage.removeItem(PROBE_KEY);
    } catch (error) {}
    return next || apiBase();
  }

  function lastGoodBase() {
    try {
      var saved = JSON.parse(localStorage.getItem(FALLBACK_KEY) || "null");
      if (saved && saved.base && Number(saved.until) > Date.now()) return saved.base;
    } catch (error) {}
    return "";
  }

  function markGood(base) {
    if (!base) return;
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify({ base: base, until: Date.now() + FALLBACK_TTL }));
    } catch (error) {}
  }

  function clearLastGood() {
    try {
      localStorage.removeItem(FALLBACK_KEY);
    } catch (error) {}
  }

  function activeBase() {
    return resolvedBase || lastGoodBase() || apiBase();
  }

  function cachedProbe() {
    try {
      var saved = JSON.parse(localStorage.getItem(PROBE_KEY) || "null");
      if (saved && saved.base && Number(saved.until) > Date.now()) return saved.base;
    } catch (error) {}
    return "";
  }

  function rememberProbe(base) {
    resolvedBase = base;
    try {
      localStorage.setItem(PROBE_KEY, JSON.stringify({ base: base, until: Date.now() + PROBE_TTL }));
    } catch (error) {}
  }

  // Descobre qual API está no ar: prefere a real (sem mock:true), senão o mock.
  async function probeBases() {
    if (LOCAL_HOST) return DEFAULT_BASE;
    var cached = cachedProbe();
    if (cached) {
      resolvedBase = cached;
      return cached;
    }

    var real = "";
    var mock = "";
    for (var i = 0; i < CANDIDATE_BASES.length; i++) {
      var base = CANDIDATE_BASES[i];
      try {
        var response = await fetch(base + "/health", {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "omit"
        });
        if (!response.ok) continue;
        var data = null;
        try {
          data = await response.json();
        } catch (error) {}
        if (!data || data.status !== "ok") continue;
        if (data.mock) {
          if (!mock) mock = base;
        } else if (!real) {
          real = base;
        }
      } catch (error) {}
    }

    var chosen = real || mock || DEFAULT_BASE;
    rememberProbe(chosen);
    return chosen;
  }

  function resolveBase() {
    clearOldBase();
    if (LOCAL_HOST) {
      resolvedBase = DEFAULT_BASE;
      return Promise.resolve(DEFAULT_BASE);
    }
    var manual = normalizeBase(localStorage.getItem(API_KEY));
    if (manual && manual !== DEFAULT_BASE) {
      resolvedBase = manual;
      return Promise.resolve(manual);
    }
    if (cachedProbe()) {
      resolvedBase = cachedProbe();
      return Promise.resolve(resolvedBase);
    }
    if (!probePromise) {
      probePromise = probeBases();
      probePromise.catch(function () { probePromise = null; });
    }
    return probePromise;
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
      writeValue("cepk_user_classes", Array.isArray(data.user.classes) ? data.user.classes.join(", ") : "", remember);
    }
  }

  function clearSession() {
    [localStorage, sessionStorage].forEach(function (storage) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
      storage.removeItem("cepk_user_name");
      storage.removeItem("cepk_user_email");
      storage.removeItem("cepk_user_subject");
      storage.removeItem("cepk_user_classes");
      storage.removeItem("cepk_user_role");
    });
  }

  function clearOldBase() {
    try {
      localStorage.removeItem("cepk_api_base");
      sessionStorage.removeItem("cepk_api_base");
    } catch (error) {}
  }

  function statusMessage(status) {
    if (status === 0) return "Não foi possível conectar à API.";
    if (status === 400) return "Dados inválidos. Se o erro mencionar turma ou disciplina, atualize a página (Ctrl+F5): sua versão do aplicativo está desatualizada.";
    if (status === 401) return "Sessão expirada. Faça login novamente.";
    if (status === 403) return "Você não tem permissão para esta ação.";
    if (status === 404) return "Recurso não encontrado na API (versão desatualizada?).";
    if (status === 409) return "Conflito: este registro já existe ou está em uso.";
    if (status >= 500) return "Erro no servidor da API. Tente novamente em instantes.";
    return "Não foi possível concluir a operação.";
  }

  async function send(base, path, opts, timeoutMs) {
    var fetchOpts = opts;
    var timer = null;
    var controller = null;

    if (typeof AbortController !== "undefined" && !opts.signal) {
      controller = new AbortController();
      fetchOpts = Object.assign({}, opts, { signal: controller.signal });
      timer = setTimeout(function () { controller.abort(); }, timeoutMs || REQUEST_TIMEOUT);
    }

    try {
      var response = await fetch(base + path, fetchOpts);
      var data = null;

      try {
        data = await response.json();
      } catch (error) {}

      if (!response.ok) {
        if (!data || typeof data !== "object") data = {};
        if (!data.error) data.error = statusMessage(response.status);
      }

      if (response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
        // Token vencido: o refresh e tentado em request() antes de encerrar a sessao.
      }

      return { ok: response.ok, status: response.status, data: data };
    } catch (error) {
      var aborted = error && error.name === "AbortError";
      return {
        ok: false,
        status: 0,
        timeout: aborted,
        data: {
          error: aborted
            ? "Tempo esgotado ao conectar à API. O servidor pode estar iniciando; tente novamente."
            : "Não foi possível conectar à API (rede ou CORS bloqueado). Verifique se o servidor está ligado."
        }
      };
    } finally {
      if (timer) clearTimeout(timer);
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

    var base = await resolveBase();
    var result = await send(base, path, opts, opts.timeout);

    if (DEAD_STATUS.indexOf(result.status) < 0) {
      markGood(base);
      if (result.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
        // Token vencido: renova a sessao e repete a requisicao.
        var renewed = await renewSession(base);
        if (renewed) {
          var retryHeaders = Object.assign({}, headers);
          var freshToken = token();
          if (freshToken) retryHeaders.Authorization = "Bearer " + freshToken;
          var retryOpts = Object.assign({}, opts, { headers: retryHeaders });
          var retried = await send(base, path, retryOpts, opts.timeout);
          if (DEAD_STATUS.indexOf(retried.status) < 0) return retried;
          result = retried;
        }
      }
      return result;
    }

    // A base ativa caiu: tenta as outras candidatas em ordem (API real -> outra real -> mock).
    for (var i = 0; i < CANDIDATE_BASES.length; i++) {
      var candidate = CANDIDATE_BASES[i];
      if (candidate === base) continue;
      var attempt = await send(candidate, path, opts, opts.timeout);
      if (DEAD_STATUS.indexOf(attempt.status) < 0) {
        markGood(candidate);
        resolvedBase = candidate;
        console.warn("API " + base + " indisponível; usando " + candidate + ".");
        return attempt;
      }
    }

    return result;
  }

  var renewing = null;

  function sessionRemembered() {
    try {
      return localStorage.getItem(TOKEN_KEY) !== null;
    } catch (error) {
      return false;
    }
  }

  function expireSession() {
    clearSession();
    try {
      var here = (window.location.pathname.split("/").pop() || "index.html");
      if (here.indexOf("login") === -1) {
        window.location.href = "login.html?sessao=expirada&dest=" + encodeURIComponent(here);
      }
    } catch (error) {}
  }

  function renewSession(base) {
    if (renewing) return renewing;
    renewing = request("/auth/refresh", { method: "POST" })
      .then(function (result) {
        if (result && result.ok && result.data && result.data.accessToken) {
          saveSession(result.data, sessionRemembered());
          return true;
        }
        expireSession();
        return false;
      })
      .catch(function () {
        expireSession();
        return false;
      })
      .then(function (ok) {
        renewing = null;
        return ok;
      });
    return renewing;
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

  function labs(includeInactive) {
    return request("/labs" + (includeInactive ? "?includeInactive=true" : ""));
  }

  function createLab(payload) {
    return request("/labs", { method: "POST", body: payload || {} });
  }

  function updateLab(labId, payload) {
    return request("/labs/" + encodeURIComponent(labId), { method: "PUT", body: payload || {} });
  }

  function deleteLab(labId) {
    return request("/labs/" + encodeURIComponent(labId), { method: "DELETE" });
  }

  function periods() {
    return request("/periods");
  }

  function subjects() {
    return request("/subjects");
  }

  function classes() {
    return request("/classes");
  }

  function classes() {
    return request("/classes");
  }

  function createClass(payload) {
    return request("/classes", { method: "POST", body: payload || {} });
  }

  function professors() {
    return request("/professors");
  }

  function createReservation(payload) {
    return request("/reservations", { method: "POST", body: payload });
  }

  function reservations(status) {
    var query = status ? "?status=" + encodeURIComponent(status) : "";
    return request("/reservations" + query);
  }

  async function adminReservations(status) {
    var query = status ? "?status=" + encodeURIComponent(status) : "";
    var result = await request("/admin/reservations" + query);

    if (result.status === 404) {
      var fallback = await reservations();
      if (fallback.ok) {
        var list = (fallback.data && fallback.data.reservations) || [];
        if (status) {
          var wanted = String(status).toLowerCase();
          list = list.filter(function (item) {
            return String((item && item.status) || "").toLowerCase() === wanted;
          });
        }
        return { ok: true, status: 200, data: { reservations: list }, legacy: true };
      }
    }

    return result;
  }

  function adminUsers(status, query) {
    var params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    var suffix = params.toString() ? "?" + params.toString() : "";
    return request("/admin/users" + suffix);
  }

  function approveUser(userId) {
    return request("/admin/users/" + encodeURIComponent(userId) + "/approve", {
      method: "POST",
      body: {}
    });
  }

  function rejectUser(userId, payload) {
    return request("/admin/users/" + encodeURIComponent(userId) + "/reject", {
      method: "POST",
      body: payload || {}
    });
  }

  function deleteUser(userId) {
    return request("/admin/users/" + encodeURIComponent(userId), { method: "DELETE" });
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

  function deleteReservation(id) {
    return request("/reservations/" + encodeURIComponent(id), {
      method: "DELETE"
    });
  }

  function schedule() {
    return request("/schedule");
  }

  function saveScheduleEntry(payload) {
    return request("/schedule", { method: "PUT", body: payload || {} });
  }

  function deleteScheduleEntry(payload) {
    var params = new URLSearchParams();
    params.set("lab", String((payload && payload.lab) || ""));
    params.set("weekday", String((payload && payload.weekday) || ""));
    params.set("period", String((payload && payload.period) || ""));
    return request("/schedule?" + params.toString(), { method: "DELETE" });
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
    if (result && result.status) return statusMessage(result.status);
    return fallback || "Não foi possível concluir a operação.";
  }

  window.CEPKApi = {
    apiBase: apiBase,
    activeBase: activeBase,
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
    labs: labs,
    createLab: createLab,
    updateLab: updateLab,
    deleteLab: deleteLab,
    classes: classes,
    createClass: createClass,
    professors: professors,
    periods: periods,
    subjects: subjects,
    classes: classes,
    createReservation: createReservation,
    reservations: reservations,
    adminReservations: adminReservations,
    adminUsers: adminUsers,
    approveUser: approveUser,
    rejectUser: rejectUser,
    deleteUser: deleteUser,
    approveReservation: approveReservation,
    rejectReservation: rejectReservation,
    deleteReservation: deleteReservation,
    schedule: schedule,
    saveScheduleEntry: saveScheduleEntry,
    deleteScheduleEntry: deleteScheduleEntry,
    normalizeReservation: normalizeReservation,
    mergeReservations: mergeReservations,
    approvalUrl: approvalUrl,
    errorMessage: errorMessage
  };
})();
