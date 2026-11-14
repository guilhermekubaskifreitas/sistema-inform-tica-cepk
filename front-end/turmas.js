/* ==========================================================================
   CEPK Turmas — modulo compartilhado (cadastro do professor e reserva)
   Lista oficial de turmas do CEPK (28) + seletores reutilizaveis.
   ========================================================================== */
(function () {
  "use strict";

  var TURMAS = [
    // Tarde
    { name: "6A", shift: "tarde" },
    { name: "6B", shift: "tarde" },
    { name: "6C", shift: "tarde" },
    { name: "7A", shift: "tarde" },
    { name: "7B", shift: "tarde" },
    { name: "7C", shift: "tarde" },
    { name: "8A", shift: "tarde" },
    { name: "8B", shift: "tarde" },
    { name: "8C", shift: "tarde" },
    { name: "9A", shift: "tarde" },
    { name: "9B", shift: "tarde" },
    { name: "9C", shift: "tarde" },
    { name: "1ADM", shift: "tarde" },
    { name: "1DSB", shift: "tarde" },
    // Manha
    { name: "1A", shift: "manha" },
    { name: "1B", shift: "manha" },
    { name: "1C", shift: "manha" },
    { name: "2A", shift: "manha" },
    { name: "2B", shift: "manha" },
    { name: "2C", shift: "manha" },
    { name: "3A", shift: "manha" },
    { name: "3B", shift: "manha" },
    { name: "3C", shift: "manha" },
    { name: "2DSB", shift: "manha" },
    { name: "2ADM", shift: "manha" },
    { name: "3DSB", shift: "manha" },
    { name: "3DSC", shift: "manha" },
    { name: "3ADM", shift: "manha" }
  ];

  var SHIFT_LABEL = { manha: "Manhã", tarde: "Tarde" };

  function byShift(shift) {
    return TURMAS.filter(function (t) { return t.shift === shift; });
  }

  function normalize(name) {
    return String(name || "").trim().toUpperCase();
  }

  function shiftOf(name) {
    var target = normalize(name);
    for (var i = 0; i < TURMAS.length; i++) {
      if (normalize(TURMAS[i].name) === target) return TURMAS[i].shift;
    }
    return "";
  }

  /* --------------------------------------------------------------------
     Popup de multi-selecao (mesmo padrao do popup de disciplinas)
     -------------------------------------------------------------------- */
  function setupPicker(options) {
    var input = document.getElementById(options.inputId);
    var pop = document.getElementById(options.popId);
    if (!input || !pop) return null;

    var state = { extra: [] };

    function renderRows() {
      var items = TURMAS.concat(state.extra.map(function (name) {
        return { name: name, shift: shiftOf(name) || "manha", extra: true };
      }));

      var html = '<div class="pop-head">Turmas — clique para marcar</div>';
      ["manha", "tarde"].forEach(function (shift) {
        var group = items.filter(function (t) { return t.shift === shift; });
        if (!group.length) return;
        html += '<div class="pop-group">' + (SHIFT_LABEL[shift] || shift) + "</div>";
        group.forEach(function (t) {
          html += '<button type="button" class="row" data-value="' + escapeAttr(t.name) +
            '" aria-pressed="false"><span class="check" aria-hidden="true">✓</span>' +
            '<span class="meta">' + escapeHtml(t.name) + "</span></button>";
        });
      });
      html +=
        '<div class="pop-new">' +
        '<input type="text" maxlength="40" placeholder="Cadastrar nova turma (ex.: 4A)" aria-label="Nova turma" />' +
        '<button type="button" class="pop-add">Adicionar</button>' +
        "</div>";
      pop.innerHTML = html;
      bindRows();
    }

    function bindRows() {
      var rows = pop.querySelectorAll(".row");
      Array.prototype.forEach.call(rows, function (row) {
        row.addEventListener("click", function () {
          var selected = row.classList.toggle("selected");
          row.setAttribute("aria-pressed", String(selected));
          sync();
          if (options.onChange) options.onChange(selectedClasses());
        });
      });

      var addBtn = pop.querySelector(".pop-add");
      var newInput = pop.querySelector(".pop-new input");
      if (addBtn && newInput) {
        var add = function () {
          var name = normalize(newInput.value);
          if (!name) return;
          var exists = TURMAS.concat(state.extra.map(function (n) { return { name: n }; })).some(function (t) {
            return normalize(t.name) === name;
          });
          if (!exists) state.extra.push(name);
          newInput.value = "";
          renderRows();
          sync();
          if (options.onChange) options.onChange(selectedClasses());
        };
        addBtn.addEventListener("click", add);
        newInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        });
      }
    }

    function selectedClasses() {
      var out = [];
      Array.prototype.forEach.call(pop.querySelectorAll(".row.selected"), function (row) {
        var value = row.dataset.value;
        if (value && out.indexOf(value) === -1) out.push(value);
      });
      return out;
    }

    function sync() {
      input.value = selectedClasses().join(", ");
    }

    function open() {
      var openers = document.querySelectorAll(".fill-pop.open");
      Array.prototype.forEach.call(openers, function (p) {
        if (p !== pop) p.classList.remove("open");
      });
      pop.classList.add("open");
    }

    input.addEventListener("focus", open);
    input.addEventListener("click", open);
    document.addEventListener("click", function (e) {
      if (!pop.contains(e.target) && e.target !== input) pop.classList.remove("open");
    });

    renderRows();

    return {
      value: selectedClasses,
      reset: function () {
        state.extra = [];
        renderRows();
        sync();
      }
    };
  }

  /* --------------------------------------------------------------------
     Select de turmas (reserva) — tenta a API, cai para a lista oficial
     -------------------------------------------------------------------- */
  function setupSelect(options) {
    var select = document.getElementById(options.selectId);
    if (!select) return null;

    var state = { preferred: options.preferred || [], list: [] };

    function render() {
      var names = [];
      state.list.forEach(function (t) { names.push(t.name); });
      TURMAS.forEach(function (t) { if (names.indexOf(t.name) === -1) names.push(t.name); });

      var preferred = state.preferred.map(normalize).filter(function (n) {
        return names.some(function (x) { return normalize(x) === n; });
      });

      var html = '<option value="">' + (options.placeholder || "Selecione a turma") + "</option>";
      if (preferred.length) {
        html += '<optgroup label="Minhas turmas">';
        preferred.forEach(function (name) {
          html += '<option value="' + escapeAttr(name) + '">' + escapeHtml(name) + "</option>";
        });
        html += "</optgroup>";
      }
      html += '<optgroup label="Todas as turmas">';
      names.forEach(function (name) {
        if (preferred.indexOf(normalize(name)) !== -1) return;
        html += '<option value="' + escapeAttr(name) + '">' + escapeHtml(name) + "</option>";
      });
      html += "</optgroup>";

      select.innerHTML = html;
      if (options.required) select.setAttribute("required", "required");
    }

    function load() {
      var api = window.CEPKApi;
      if (!api || typeof api.classes !== "function") {
        render();
        return Promise.resolve([]);
      }
      return api.classes()
        .then(function (result) {
          if (result && result.ok && result.data && Array.isArray(result.data.classes)) {
            state.list = result.data.classes.map(function (c) {
              return { name: c.name, shift: c.shift || shiftOf(c.name) || "manha" };
            });
          }
          render();
          return state.list;
        })
        .catch(function () {
          render();
          return state.list;
        });
    }

    render();
    load();

    return {
      load: load,
      value: function () {
        return select.value ? select.value.trim() : "";
      },
      element: select
    };
  }

  /* --------------------------------------------------------------------
     Select de turma com cadastro (painel do calendario)
     - turmas do professor digitado no topo
     - lista oficial (28) + turmas extras vindas da API
     - opcao de cadastrar uma nova turma
     -------------------------------------------------------------------- */
  function setupClassSelect(options) {
    var select = document.getElementById(options.selectId);
    if (!select) return null;

    var state = { list: [], extra: [], professorClasses: [], selected: "" };

    function key(value) {
      return String(value == null ? "" : value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
    }

    function allClasses() {
      var out = [];
      function add(name, shift) {
        var k = key(name);
        if (!k) return;
        for (var i = 0; i < out.length; i++) if (out[i].key === k) return;
        out.push({ key: k, name: String(name).trim(), shift: shift || shiftOf(name) || "manha" });
      }
      state.list.forEach(function (t) { add(t.name, t.shift); });
      TURMAS.forEach(function (t) { add(t.name, t.shift); });
      state.extra.forEach(function (t) { add(t.name, t.shift); });
      return out;
    }

    function optionHtml(turma, selectedKey) {
      return (
        '<option value="' + escapeAttr(turma.name) + '"' +
        (turma.key === selectedKey ? " selected" : "") + ">" + escapeHtml(turma.name) + "</option>"
      );
    }

    function render() {
      var selectedKey = key(state.selected);
      var all = allClasses();
      var profKeys = state.professorClasses.map(key);
      var prof = all.filter(function (t) { return profKeys.indexOf(t.key) !== -1; });
      var rest = all.filter(function (t) { return profKeys.indexOf(t.key) === -1; });

      var html = '<option value="">' + escapeHtml(options.placeholder || "— sem turma —") + "</option>";
      if (prof.length) {
        html += '<optgroup label="Turmas do professor">';
        prof.forEach(function (t) { html += optionHtml(t, selectedKey); });
        html += "</optgroup>";
      }
      ["manha", "tarde"].forEach(function (shift) {
        var group = rest.filter(function (t) { return t.shift === shift; });
        if (!group.length) return;
        html += '<optgroup label="' + escapeHtml(SHIFT_LABEL[shift] || shift) + '">';
        group.forEach(function (t) { html += optionHtml(t, selectedKey); });
        html += "</optgroup>";
      });
      var outras = rest.filter(function (t) { return t.shift !== "manha" && t.shift !== "tarde"; });
      if (outras.length) {
        html += '<optgroup label="Outras turmas">';
        outras.forEach(function (t) { html += optionHtml(t, selectedKey); });
        html += "</optgroup>";
      }
      html += '<option value="__nova__">➕ Cadastrar outra turma…</option>';
      select.innerHTML = html;
    }

    return {
      element: select,
      value: function () {
        var v = select.value ? String(select.value).trim() : "";
        return v === "__nova__" ? "" : v;
      },
      setValue: function (name) {
        state.selected = name || "";
        render();
      },
      refresh: function (selectedName) {
        if (selectedName !== undefined) state.selected = selectedName || "";
        var professorName = options.getProfessorName ? (options.getProfessorName() || "") : "";
        var api = window.CEPKApi;
        var jobs = [];
        if (api && typeof api.classes === "function") {
          jobs.push(
            api.classes().then(function (result) {
              if (result && result.ok && result.data && Array.isArray(result.data.classes)) {
                state.list = result.data.classes.map(function (c) {
                  return { name: c.name, shift: c.shift || shiftOf(c.name) || "manha" };
                });
              }
            }).catch(function () {})
          );
        }
        if (api && typeof api.professors === "function" && professorName) {
          jobs.push(
            api.professors().then(function (result) {
              if (!result || !result.ok || !result.data || !Array.isArray(result.data.professors)) return;
              var target = null;
              result.data.professors.forEach(function (p) {
                if (!target && key(p.name) === key(professorName)) target = p;
              });
              state.professorClasses = target && Array.isArray(target.classes) ? target.classes : [];
            }).catch(function () {})
          );
        } else {
          state.professorClasses = [];
        }
        return Promise.all(jobs).then(function () {
          render();
          return true;
        });
      }
    };
  }

  /* --------------------------------------------------------------------
     Select de laboratorios (cadastro) — populado pela API
     -------------------------------------------------------------------- */
  function setupLabSelect(selectId) {
    var select = document.getElementById(selectId);
    if (!select) return null;

    function render(labs) {
      var html = '<option value="">Não informar agora</option>';
      (labs || []).forEach(function (lab) {
        if (lab && lab.active === false) return;
        html += '<option value="' + escapeAttr(lab.id) + '">' + escapeHtml(lab.name) + "</option>";
      });
      select.innerHTML = html;
    }

    render([]);
    var api = window.CEPKApi;
    if (api && typeof api.labs === "function") {
      api.labs().then(function (result) {
        if (result && result.ok && result.data && Array.isArray(result.data.labs)) render(result.data.labs);
      }).catch(function () {});
    }
    return { element: select };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  window.CEPKTurmas = {
    TURMAS: TURMAS,
    shiftOf: shiftOf,
    normalize: normalize,
    setupPicker: setupPicker,
    setupSelect: setupSelect,
    setupClassSelect: setupClassSelect,
    setupLabSelect: setupLabSelect
  };
})();
