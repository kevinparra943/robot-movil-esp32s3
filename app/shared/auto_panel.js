/* ===========================================================================
 * auto_panel.js - Selector de submodo del modo AUTONOMO (app web v1 y v2).
 * Panel en linea, NO modal: la parada de emergencia queda siempre accesible.
 * El robot solo arranca al pulsar "Iniciar" (o al confirmar por voz).
 * Uso: var p = AutoPanel.create(elementoAnterior, { onStart, onCancel });
 *      p.open({ strategy: 'rumbo', deg: 90 });  p.close();
 * onStart(strategy, deg) devuelve true si la orden se envio.
 * =========================================================================== */
(function (root) {
  'use strict';
  var CSS =
    '.auto-panel{border:1px solid var(--border,var(--line,#30404c));border-radius:10px;padding:12px;margin:12px 0;' +
    'background:var(--surface-2,#22313d);color:var(--text,#e8eef2);text-align:left;min-width:0}' +
    '.auto-panel[hidden]{display:none}' +
    '.auto-panel legend{padding:0 6px;font-weight:600}' +
    '.auto-panel label.auto-opt{display:flex;gap:10px;align-items:flex-start;padding:8px 4px;cursor:pointer}' +
    '.auto-panel input[type=radio]{margin-top:3px;accent-color:var(--ok,#42c9a5)}' +
    '.auto-panel small{display:block;color:var(--text-2,#a4b2bd)}' +
    '.auto-panel .auto-deg{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 0 8px 28px}' +
    '.auto-panel .auto-deg input{width:88px}' +
    '.auto-panel .auto-deg input,.auto-panel button{font:inherit;min-height:40px;padding:0 12px;border-radius:8px;' +
    'border:1px solid var(--border-strong,#4a5d6b);background:var(--surface,#19232d);color:inherit}' +
    '.auto-panel button{cursor:pointer}' +
    '.auto-panel .auto-go{background:var(--ok,#42c9a5);color:var(--ok-ink,#072a21);border-color:transparent;font-weight:600}' +
    '.auto-panel .auto-actions{display:flex;gap:8px;margin-top:8px}' +
    '.auto-panel .auto-msg{color:var(--warn,#e5ad52);margin:6px 0 0}';

  var HTML =
    '<legend>Modo autónomo: ¿qué debe hacer?</legend>' +
    '<label class="auto-opt"><input type="radio" name="autoStrategy" value="evadir"><span>Solo esquivar obstáculos' +
    '<small>Avanza recto y esquiva lo que encuentre.</small></span></label>' +
    '<label class="auto-opt"><input type="radio" name="autoStrategy" value="rumbo"><span>Seguir un rumbo y esquivar' +
    '<small>Guiado por la brújula. Si la pierde, sigue esquivando.</small></span></label>' +
    '<div class="auto-deg" hidden><input type="number" min="0" max="359" step="1" inputmode="numeric" ' +
    'placeholder="0–359°" aria-label="Rumbo en grados">' +
    '<button type="button" data-deg="0">N</button><button type="button" data-deg="90">E</button>' +
    '<button type="button" data-deg="180">S</button><button type="button" data-deg="270">O</button></div>' +
    '<label class="auto-opt"><input type="radio" name="autoStrategy" value="linea"><span>Seguir una línea y esquivar' +
    '<small>Cualquier color menos blanco. Rodea el obstáculo y vuelve a la línea.</small></span></label>' +
    '<div class="auto-actions"><button type="button" class="auto-go">Iniciar</button>' +
    '<button type="button" class="auto-cancel">Cancelar</button></div>' +
    '<p class="auto-msg" role="status"></p>';

  function create(after, opts) {
    if (!document.getElementById('autoPanelCss')) {
      var st = document.createElement('style');
      st.id = 'autoPanelCss';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var el = document.createElement('fieldset');
    el.className = 'auto-panel';
    el.hidden = true;
    el.innerHTML = HTML;
    after.insertAdjacentElement('afterend', el);
    var q = function (s) { return el.querySelector(s); };
    var degBox = q('.auto-deg'), degInput = q('.auto-deg input'), msg = q('.auto-msg');

    function selected() {
      var r = q('input[name=autoStrategy]:checked');
      return r ? r.value : null;
    }
    // Estilo en linea: .auto-deg usa display:flex y taparia el atributo hidden.
    function sync() { degBox.style.display = selected() === 'rumbo' ? 'flex' : 'none'; msg.textContent = ''; }
    function close() { el.hidden = true; }
    function open(preset) {
      preset = preset || {};
      el.querySelectorAll('input[name=autoStrategy]').forEach(function (r) {
        r.checked = r.value === preset.strategy;
      });
      if (preset.deg !== undefined && preset.deg !== null) degInput.value = Math.round(preset.deg) % 360;
      degBox.hidden = false;
      sync();
      el.hidden = false;
      if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    el.addEventListener('change', function (e) { if (e.target.name === 'autoStrategy') sync(); });
    el.querySelectorAll('[data-deg]').forEach(function (b) {
      b.onclick = function () { degInput.value = b.getAttribute('data-deg'); msg.textContent = ''; };
    });
    q('.auto-cancel').onclick = function () { close(); if (opts.onCancel) opts.onCancel(); };
    q('.auto-go').onclick = function () {
      var s = selected(), deg;
      if (!s) { msg.textContent = 'Elige uno de los tres modos.'; return; }
      if (s === 'rumbo') {
        deg = Number(degInput.value);
        if (degInput.value.trim() === '' || !isFinite(deg) || deg < 0 || deg >= 360) {
          msg.textContent = 'Escribe el rumbo: de 0 a 359 grados.';
          degInput.focus();
          return;
        }
      }
      if (opts.onStart(s, deg)) close();
      else msg.textContent = 'No se pudo enviar. Revisa la conexión y la parada de emergencia.';
    };
    return { open: open, close: close, isOpen: function () { return !el.hidden; } };
  }

  root.AutoPanel = { create: create };
})(typeof self !== 'undefined' ? self : this);
