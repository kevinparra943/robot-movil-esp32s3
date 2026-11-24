/* ===========================================================================
 * app.js - Interfaz de control y monitorizacion (RF-08).
 * Usa RobotProtocol, RobotCommands y Jarvis (app/shared/*).
 * Incluye modo simulacion para probar la interfaz sin robot.
 *
 * Reglas de seguridad de la interfaz:
 *  - Los comandos se envian en el mismo evento de puntero/teclado; ninguna
 *    animacion se interpone entre la pulsacion y el envio.
 *  - "Detener" y la parada de emergencia nunca se deshabilitan.
 *  - Sin enlace no se muestran datos: los instrumentos vuelven a "sin dato".
 *  - La simulacion se identifica siempre como tal (punto azul + "SIM").
 * =========================================================================== */
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var ws = null;
  var linkState = 'off';      // 'off' | 'connecting' | 'on' | 'sim'
  var connected = false;      // enlace operativo (real o simulado)
  var simMode = false;
  var simTimer = null;
  var driveTimer = null;
  var voiceDriveTimer = null;
  var lastTelemetry = {};
  var lastTelemetryAt = 0;
  var VOICE_DRIVE_MS = 1500;
  var recognizing = false;
  var estopActive = false;
  var heldButton = null;      // boton de conduccion mantenido (deadman)
  var needleDeg = 0;          // rotacion acumulada: la aguja gira por el arco corto
  var targetDeg = 0;

  var DIST_MAX = 200;         // escala de las barras (cm)
  var DIST_DANGER = 30;       // umbral de peligro (cm)
  var DIST_WARN = 60;         // umbral de aviso (cm)
  var STALE_MS = 2500;

  var CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  var COLOR_HEX = {
    negro: '#111111',
    blanco: '#EEEEEE',
    rojo: '#E33333',
    amarillo: '#E5C100',
    verde: '#22AA22',
    azul: '#2266FF'
  };
  var LOG_TAG = { ok: 'OK', warn: 'AVISO', error: 'ERROR', event: 'EVENTO', out: 'ENVÍO', voice: 'VOZ' };

  // ---------------------------------------------------------------
  // Utilidades de interfaz
  // ---------------------------------------------------------------
  function formatTime(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.toLocaleTimeString('es-CO', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }

  function log(kind, text) {
    var list = $('log');
    var li = document.createElement('li');
    li.className = 'log__item log__item--' + kind;
    var time = document.createElement('time');
    time.textContent = formatTime();
    var tag = document.createElement('span');
    tag.className = 'log__tag';
    tag.textContent = LOG_TAG[kind] || String(kind).toUpperCase();
    var msg = document.createElement('span');
    msg.className = 'log__msg';
    msg.textContent = text;
    li.appendChild(time);
    li.appendChild(tag);
    li.appendChild(msg);
    list.prepend(li);
    while (list.children.length > 200) list.removeChild(list.lastChild);
    $('logCount').textContent = String(list.children.length);
  }

  function setChip(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.className = 'chip' + (tone ? ' chip--' + tone : '');
  }

  // Estado del enlace. 'sim' nunca se presenta como conexion fisica.
  function setConn(state) {
    linkState = state;
    connected = state === 'on' || state === 'sim';
    document.body.setAttribute('data-link', state);

    var labels = { off: 'Desconectado', connecting: 'Conectando…', on: 'Conectado', sim: 'Simulación' };
    $('connDot').className = 'dot ' + state;
    $('connText').textContent = labels[state];
    $('simBadge').hidden = state !== 'sim';

    var chip = { off: ['sin enlace', ''], connecting: ['conectando', 'warn'],
                 on: ['en línea', 'ok'], sim: ['simulación', 'info'] }[state];
    setChip($('connChip'), chip[0], chip[1]);

    var btn = $('btnConnect');
    var realLink = state === 'on' || state === 'connecting';
    btn.textContent = realLink ? 'Desconectar' : 'Conectar';
    btn.classList.toggle('is-danger', realLink);
    $('wsUrl').disabled = realLink;

    $('telemetryMeta').textContent = state === 'on' ? 'En vivo'
      : state === 'sim' ? 'Datos sintéticos'
      : state === 'connecting' ? 'Esperando enlace…' : 'Sin enlace';
    if (state === 'off') $('connInfo').textContent = '';
    if (state === 'sim') $('connInfo').textContent = 'Simulación local: ningún comando llega al robot.';

    if (!connected) {
      document.body.classList.remove('is-stale');
      clearTelemetry();
    }
    updateControls();
  }

  function colorCss(name) {
    return COLOR_HEX[String(name || '').toLowerCase()] || '#666666';
  }

  function rgbHex(rgb) {
    if (!rgb || rgb.length < 3) return '';
    var hex = '#';
    for (var i = 0; i < 3; i++) {
      var n = Math.max(0, Math.min(255, Math.round(Number(rgb[i]) || 0)));
      hex += ('0' + n.toString(16)).slice(-2);
    }
    return hex.toUpperCase();
  }

  function cardinal(deg) {
    if (!isFinite(deg)) return '—';
    return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  }

  function formatDeg(value) {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    return Number(value).toFixed(1) + '°';
  }

  function shortestTo(prev, next) {
    return prev + ((((next - prev) % 360) + 540) % 360) - 180;
  }

  function isAutoMode(mode) {
    return String(mode || '').toLowerCase().indexOf('autonom') === 0;
  }

  // ---------------------------------------------------------------
  // Estado de los controles (habilitado + motivo visible)
  // ---------------------------------------------------------------
  function driveLock() {
    if (linkState === 'connecting') return { text: 'Conectando con el robot…', tone: 'warn' };
    if (!connected) return { text: 'Sin enlace: conecta con el robot o activa la simulación.', tone: '' };
    if (estopActive) return { text: 'Parada de emergencia activa: motores desactivados.', tone: 'danger' };
    if (isAutoMode(lastTelemetry.mode)) return { text: 'Modo autónomo: el robot navega solo. Pulsa Manual para conducir.', tone: 'info' };
    return null;
  }

  function updateControls() {
    var lock = driveLock();
    var el = $('driveLock');
    el.hidden = !lock;
    if (lock) {
      el.textContent = lock.text;
      el.className = 'lock' + (lock.tone ? ' is-' + lock.tone : '');
    }

    // Si un boton mantenido queda bloqueado, se libera ANTES de deshabilitarlo
    // (un boton deshabilitado no recibe pointerup). El temporizador deadman se
    // corta sin reenviar: quien bloqueo (estop, cierre, cambio de modo) ya
    // implica la parada.
    if (lock && heldButton) {
      stopDrive(true);
      releaseHeld();
    }

    document.querySelectorAll('button.drive-btn').forEach(function (b) {
      b.disabled = b.getAttribute('data-dir') !== 'stop' && !!lock;
    });
    var modeLocked = !connected || estopActive;
    $('btnManual').disabled = modeLocked;
    $('btnAuto').disabled = modeLocked;
  }

  function releaseHeld() {
    if (!heldButton) return;
    var b = heldButton;
    heldButton = null;
    b.classList.remove('is-held');
    if (b._release) b._release();
  }

  // ---------------------------------------------------------------
  // Render de telemetria
  // ---------------------------------------------------------------
  function renderHeading(h) {
    var dial = $('headingDial');
    var actual = (h && typeof h.actual === 'number' && isFinite(h.actual))
      ? ((h.actual % 360) + 360) % 360 : null;
    var target = (h && typeof h.target === 'number' && isFinite(h.target))
      ? ((h.target % 360) + 360) % 360 : null;

    if (actual !== null) {
      needleDeg = shortestTo(needleDeg, actual);
      dial.style.setProperty('--heading', needleDeg.toFixed(1) + 'deg');
      $('tHeading').textContent = formatDeg(actual);
      setChip($('headingChip'), cardinal(actual), 'ok');
    } else {
      $('tHeading').textContent = '—';
      setChip($('headingChip'), 'sin dato', '');
    }

    if (target !== null) {
      targetDeg = shortestTo(targetDeg, target);
      dial.style.setProperty('--target', targetDeg.toFixed(1) + 'deg');
    }
    $('tTarget').textContent = formatDeg(target);
    $('tError').textContent = formatDeg(h ? h.error : null);
    dial.classList.toggle('has-heading', actual !== null);
    dial.classList.toggle('has-target', target !== null);

    var label = 'Brújula. ';
    label += actual !== null ? 'Rumbo actual ' + actual.toFixed(1) + ' grados' : 'Rumbo sin dato';
    if (target !== null) label += ', objetivo ' + target.toFixed(1) + ' grados';
    dial.setAttribute('aria-label', label);
  }

  function setValueWithUnit(el, value, unit) {
    el.textContent = value;
    if (unit) {
      var small = document.createElement('small');
      small.textContent = unit;
      el.appendChild(small);
    }
  }

  function renderDistance(textEl, barEl, o) {
    var valid = !!o && typeof o.distance_cm === 'number' && isFinite(o.distance_cm) && o.valid !== false;
    var d = valid ? o.distance_cm : 0;
    var tile = barEl.closest('.sonar');
    var level = !valid ? 'unknown'
      : (o.blocked || d < DIST_DANGER) ? 'danger'
      : d < DIST_WARN ? 'warning' : 'ok';

    tile.classList.remove('is-ok', 'is-warning', 'is-danger', 'is-unknown');
    tile.classList.add('is-' + level);
    tile.querySelector('.sonar__state').textContent = !o ? '—'
      : { unknown: 'sin eco', danger: o.blocked ? 'bloqueado' : 'peligro', warning: 'aviso', ok: 'libre' }[level];

    if (valid) setValueWithUnit(textEl, d.toFixed(1), 'cm');
    else textEl.textContent = '—';

    var frac = valid ? Math.max(0, Math.min(1, d / DIST_MAX)) : 0;
    barEl.style.setProperty('--value', frac.toFixed(3));
    barEl.setAttribute('aria-valuemax', valid ? String(Math.max(DIST_MAX, Math.ceil(d))) : String(DIST_MAX));
    barEl.setAttribute('aria-valuenow', valid ? d.toFixed(1) : '0');
    barEl.setAttribute('aria-valuetext', valid
      ? d.toFixed(1) + ' centímetros' + (o.blocked ? ', obstáculo bloqueando' : '')
      : 'sin lectura');
  }

  function renderColor(c) {
    var valid = !!(c && c.valid);
    var name = valid && c.name ? c.name : '';
    var hex = valid && c.rgb ? rgbHex(c.rgb) : (valid ? colorCss(name).toUpperCase() : '');
    var swatch = $('swatch');

    swatch.style.backgroundColor = valid ? (hex || colorCss(name)) : '';
    swatch.classList.toggle('is-valid', valid);
    swatch.setAttribute('aria-label', valid
      ? 'Color detectado: ' + name + (hex ? ', ' + hex : '')
      : 'Muestra de color sin dato');
    $('tColor').textContent = valid ? (name || '—') : 'sin dato';
    $('tColorHex').textContent = valid ? (hex ? 'RGB ' + hex : '—') : '—';
    setChip($('colorChip'), valid ? 'lectura válida' : 'sin dato', valid ? 'ok' : '');
  }

  function renderMotor(textEl, barEl, dirEl, value) {
    var row = barEl.closest('.motor');
    var n = Number(value);
    var known = value !== null && value !== undefined && isFinite(n);
    n = known ? Math.max(-100, Math.min(100, n)) : 0;

    textEl.textContent = known ? (n > 0 ? '+' : '') + Math.round(n) + ' %' : '—';
    dirEl.textContent = !known ? '—' : n > 0 ? '▶ avance' : n < 0 ? '◀ reversa' : 'detenido';
    barEl.style.setProperty('--m', (n / 100).toFixed(3));
    barEl.classList.toggle('is-reverse', n < 0);
    row.classList.toggle('is-fwd', n > 0);
    row.classList.toggle('is-reverse', n < 0);
    barEl.setAttribute('aria-valuenow', String(Math.round(n)));
    barEl.setAttribute('aria-valuetext', !known ? 'sin dato'
      : Math.abs(Math.round(n)) + ' por ciento, ' + (n < 0 ? 'reversa' : n > 0 ? 'avance' : 'detenido'));
  }

  var MODE_LABEL = { manual: 'Manual', idle: 'En espera', safe: 'Seguro', error: 'Error' };
  function modeLabel(mode) {
    var m = String(mode || '').toLowerCase();
    if (isAutoMode(m)) return 'Autónomo';
    return MODE_LABEL[m] || (mode ? String(mode) : '—');
  }

  var STRATEGY_LABEL = { evadir: 'esquivar', rumbo: 'rumbo', linea: 'línea' };
  function renderMode(mode, strategy) {
    var isManual = String(mode || '').toLowerCase() === 'manual';
    var isAuto = isAutoMode(mode);
    var sub = isAuto && STRATEGY_LABEL[strategy];
    $('modeValue').textContent = modeLabel(mode) + (sub ? ' · ' + sub : '');
    $('btnManual').setAttribute('aria-pressed', isManual ? 'true' : 'false');
    $('btnAuto').setAttribute('aria-pressed', isAuto ? 'true' : 'false');
  }

  function setEstop(active) {
    var changed = active !== estopActive;
    estopActive = active;
    var btn = $('btnEstop');
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    document.body.classList.toggle('is-estop', active);
    $('estopBanner').hidden = !active;
    updateEstopBanner();
    if (active && changed) stopDrive(true);
  }

  function updateEstopBanner() {
    $('estopBannerText').textContent = !connected
      ? 'Último estado conocido; sin enlace no se puede confirmar.'
      : simMode
        ? 'Recarga la página para liberar la parada (simulación).'
        : 'Reinicia la placa del robot para liberar la parada.';
  }

  function setDriveActive(dir) {
    var names = { fwd: 'avanzando', back: 'retrocediendo', left: 'girando izq.', right: 'girando der.' };
    setChip($('driveState'), dir ? (names[dir] || 'orden activa') : 'en reposo', dir ? 'active' : '');
    if (!dir) {
      document.querySelectorAll('button.drive-btn.is-held').forEach(function (el) {
        el.classList.remove('is-held');
      });
    }
  }

  // Sin enlace no hay datos: todo vuelve a "sin dato". El estado de E-stop se
  // conserva como "ultimo estado conocido" hasta recibir telemetria nueva.
  function clearTelemetry() {
    lastTelemetry = {};
    lastTelemetryAt = 0;
    $('lastUpdate').textContent = '—';
    renderMode(null);
    renderHeading(null);
    renderColor(null);
    renderDistance($('tDist'), $('distBar'), null);
    renderDistance($('tDistLeft'), $('distBarLeft'), null);
    renderDistance($('tDistRight'), $('distBarRight'), null);
    renderMotor($('tLeft'), $('motorLeftBar'), $('motorLeftDir'), null);
    renderMotor($('tRight'), $('motorRightBar'), $('motorRightDir'), null);
    updateEstopBanner();
  }

  function render(t) {
    lastTelemetry = t || {};
    if (!t) return;

    lastTelemetryAt = Date.now();
    document.body.classList.remove('is-stale');
    $('lastUpdate').textContent = formatTime(lastTelemetryAt);
    if (linkState === 'on') $('telemetryMeta').textContent = 'En vivo';

    renderMode(t.mode, (t.nav || {}).strategy);
    if (t.heading) renderHeading(t.heading);
    if (t.color) renderColor(t.color);
    if (t.obstacle) renderDistance($('tDist'), $('distBar'), t.obstacle);
    if (t.obstacle_left) renderDistance($('tDistLeft'), $('distBarLeft'), t.obstacle_left);
    if (t.obstacle_right) renderDistance($('tDistRight'), $('distBarRight'), t.obstacle_right);
    if (t.motors) {
      renderMotor($('tLeft'), $('motorLeftBar'), $('motorLeftDir'), t.motors.left);
      renderMotor($('tRight'), $('motorRightBar'), $('motorRightDir'), t.motors.right);
    }
    updateEstopBanner();
    checkDriveIntent();
    setEstop(!!t.estop);
    updateControls();
  }

  // ---------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------
  function send(cmd, silent) {
    if (!cmd) return false;
    if (simMode) return simHandle(cmd, silent);
    if (!connected || !ws || ws.readyState !== 1) {
      log('warn', 'No conectado: ' + RobotCommands.describe(cmd));
      return false;
    }
    ws.send(RobotProtocol.encode(cmd));
    if (!silent) log('out', '→ ' + RobotCommands.describe(cmd));
    return true;
  }

  // ---------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------
  function connect() {
    var url = $('wsUrl').value.trim();
    if (!url) return;
    var sock;
    try {
      sock = new WebSocket(url);
    } catch (e) {
      log('error', 'URL inválida: ' + url);
      return;
    }
    ws = sock;

    setConn('connecting');
    $('connInfo').textContent = 'Abriendo ' + url + '…';
    sock.onopen = function () {
      if (ws !== sock) return;
      setConn('on');
      $('connInfo').textContent = 'Enlace establecido con ' + url;
      log('ok', 'Conectado a ' + url);
      sock.send(RobotProtocol.encode(RobotProtocol.hello()));
    };
    sock.onclose = function () {
      if (ws !== sock) return;   // cierre de un socket ya sustituido
      ws = null;
      stopDrive(true);
      setConn('off');
      log('warn', 'Conexión cerrada');
    };
    sock.onerror = function () {
      if (ws !== sock) return;
      log('error', 'Error de conexión');
    };
    sock.onmessage = function (ev) {
      if (ws !== sock) return;
      var r = RobotProtocol.parse(ev.data);
      if (!r.ok) {
        log('error', 'Mensaje inválido: ' + r.error.code);
        return;
      }
      var m = r.msg;
      if (m.t === 'hello_ack') log('ok', 'Handshake correcto (v' + m.v + ')');
      else if (m.t === 'telemetry') render(m);
      else if (m.t === 'ack') log('ok', 'ack: ' + m.of + (m.value !== undefined ? ' = ' + m.value : ''));
      else if (m.t === 'event') log('event', m.code + (m.detail ? ' (' + m.detail + ')' : ''));
      else if (m.t === 'error') log('error', m.code + ' ' + (m.detail || ''));
      else if (m.t === 'pong') log('ok', 'pong');
    };
  }

  function disconnect() {
    stopDrive(true);
    var sock = ws;
    ws = null;
    if (sock) {
      try { sock.close(); } catch (e) {}
      log('warn', 'Conexión cerrada por el operador');
    }
    if (!simMode) setConn('off');
  }

  // ---------------------------------------------------------------
  // Modo simulacion (sin robot)
  // ---------------------------------------------------------------
  var sim = {
    mode: 'idle', estop: false,
    heading: { actual: 87.5, target: 90.0, error: -2.5 },
    color: { name: 'verde', rgb: [120, 200, 90], valid: true },
    obstacle: { distance_cm: 34.2, valid: true, blocked: false },
    obstacle_left: { distance_cm: 60.0, valid: true, blocked: false },
    obstacle_right: { distance_cm: 45.0, valid: true, blocked: false },
    motors: { left: 0, right: 0, state: 'stopped' }
  };

  function simTick() {
    sim.heading.actual = (sim.heading.actual + 0.7) % 360;
    sim.heading.error = ((sim.heading.target - sim.heading.actual + 540) % 360) - 180;
    sim.obstacle.distance_cm = Math.max(5, 30 + 10 * Math.sin(Date.now() / 1500));
    sim.obstacle.blocked = sim.obstacle.distance_cm < 25;
    sim.obstacle_left.distance_cm = Math.max(5, 60 + 12 * Math.sin(Date.now() / 1700));
    sim.obstacle_left.blocked = sim.obstacle_left.distance_cm < 25;
    sim.obstacle_right.distance_cm = Math.max(5, 45 + 10 * Math.cos(Date.now() / 1900));
    sim.obstacle_right.blocked = sim.obstacle_right.distance_cm < 25;
    render(RobotProtocol.telemetry({
      mode: sim.mode, conn: true, heading: sim.heading, color: sim.color,
      obstacle: sim.obstacle, obstacle_left: sim.obstacle_left,
      obstacle_right: sim.obstacle_right, motors: sim.motors,
      nav: { state: 'SIM', level: 1, strategy: sim.mode === 'autonomo' ? sim.strategy : null }, estop: sim.estop
    }));
  }

  function startSim() {
    simMode = true;
    setConn('sim');
    log('ok', 'Modo simulación activado (datos sintéticos, sin robot)');
    simTick();
    simTimer = setInterval(simTick, 200);
  }

  function stopSim() {
    simMode = false;
    stopDrive(true);
    if (simTimer) clearInterval(simTimer);
    simTimer = null;
    $('chkSim').checked = false;
    setConn('off');
    log('ok', 'Modo simulación desactivado');
  }

  function simHandle(cmd) {
    if (sim.estop && ['drive', 'mode', 'heading'].indexOf(cmd.t) !== -1) {
      log('error', 'SAFETY: estop activo (simulación)');
      return false;
    }
    if (cmd.t === 'drive') {
      if (cmd.dir === 'stop') {
        sim.motors = { left: 0, right: 0, state: 'stopped' };
        if (sim.mode === 'autonomo') sim.mode = 'idle';   // como el firmware
        setDriveActive(null);
      } else {
        // Tracción diferencial: giro = ruedas en sentidos opuestos.
        var speed = parseInt(cmd.speed, 10) || 0;
        var lr = { fwd: [1, 1], back: [-1, -1], left: [-1, 1], right: [1, -1] }[cmd.dir] || [0, 0];
        sim.motors = { left: lr[0] * speed, right: lr[1] * speed, state: 'moving' };
      }
    } else if (cmd.t === 'mode') {
      sim.mode = cmd.value;
      sim.strategy = cmd.strategy || null;
      sim.motors = cmd.value === 'autonomo' ? { left: 45, right: 45, state: 'moving' } : { left: 0, right: 0, state: 'stopped' };
      if (cmd.deg !== undefined) sim.heading.target = cmd.deg;
      log('event', RobotCommands.describe(cmd) + ' (simulación)');
    } else if (cmd.t === 'estop') {
      sim.estop = true;
      sim.motors = { left: 0, right: 0, state: 'stopped' };
      setDriveActive(null);
      log('event', 'ESTOP (simulación)');
    }
    return true;
  }

  // ---------------------------------------------------------------
  // Control manual con deadman
  // ---------------------------------------------------------------
  var driveIntent = null;
  var driveIntentTimer = null;

  function clearVoiceDrive() {
    if (voiceDriveTimer) { clearTimeout(voiceDriveTimer); voiceDriveTimer = null; }
  }
  function clearDriveIntent() {
    if (driveIntentTimer) { clearInterval(driveIntentTimer); driveIntentTimer = null; }
    driveIntent = null;
  }

  function frontObstacleDistance() {
    var o = lastTelemetry.obstacle || {};
    if (o.valid && typeof o.distance_cm === 'number') return o.distance_cm;
    return null;
  }

  function checkDriveIntent() {
    if (!driveIntent || !driveTimer) return;
    if (driveIntent.until !== 'front_obstacle') return;
    var dist = frontObstacleDistance();
    if (dist !== null && dist <= driveIntent.stopCm) {
      stopDrive(false);
      log('ok', 'Obstáculo frontal a ' + dist.toFixed(1) + ' cm: detenido.');
      voiceStatus('obstáculo detectado', 'ok', 'Detenido: obstáculo frontal a ' + dist.toFixed(1) + ' cm (límite ' + driveIntent.stopCm + ' cm).');
    }
  }

  function startDrive(dir, opts) {
    opts = opts || {};
    var fromVoice = opts.source === 'voice';
    var speed = opts.speed !== undefined ? parseInt(opts.speed, 10) : parseInt($('speed').value, 10);
    var autoStopMs = opts.autoStopMs || 0;
    var until = opts.until || null;
    var stopCm = opts.stopCm !== undefined ? Number(opts.stopCm) : 10;
    var maxMs = opts.maxMs !== undefined ? parseInt(opts.maxMs, 10) : autoStopMs;

    stopDrive(true);

    if (dir === 'stop') {
      var stopped = send(RobotProtocol.drive('stop', 0));
      setDriveActive(null);
      return stopped;
    }

    if (lastTelemetry.estop) {
      var estopMsg = 'E-stop activo: reinicia la placa antes de mover.';
      log('error', estopMsg);
      if (fromVoice) voiceStatus('bloqueado por E-stop', 'danger', estopMsg);
      return false;
    }
    if (isAutoMode(lastTelemetry.mode)) {
      var autoMsg = 'Modo autonomo: pulsa Manual antes de mover.';
      log('warn', autoMsg);
      if (fromVoice) voiceStatus('bloqueado por modo', 'warn', autoMsg);
      return false;
    }
    if (until === 'front_obstacle' && !lastTelemetry.mode) {
      var modeMsg = 'Sin telemetría: confirma modo Manual/ARM antes de avanzar hasta obstáculo.';
      log('warn', modeMsg);
      if (fromVoice) voiceStatus('sin estado', 'warn', modeMsg);
      return false;
    }
    if (!isFinite(speed) || speed <= 0) {
      var speedMsg = 'Velocidad en 0 %: sube la velocidad para mover.';
      log('warn', speedMsg);
      if (fromVoice) voiceStatus('velocidad inválida', 'warn', speedMsg);
      return false;
    }

    var payload = RobotProtocol.drive(dir, speed, until ? { until: until, stop_cm: stopCm, max_ms: maxMs } : undefined);
    if (!send(payload)) {
      if (fromVoice) voiceStatus('no enviado', 'danger', 'No se pudo enviar el comando. Verifica conexión y modo Manual.');
      return false;
    }

    driveIntent = until ? { until: until, stopCm: stopCm, maxMs: maxMs, speed: speed, fromVoice: fromVoice } : null;
    driveTimer = setInterval(function () {
      var s = fromVoice ? speed : parseInt($('speed').value, 10);
      var p = RobotProtocol.drive(dir, s, until ? { until: until, stop_cm: stopCm, max_ms: maxMs } : undefined);
      send(p, true);
    }, 200);
    setDriveActive(dir);

    if (driveIntent) {
      driveIntentTimer = setInterval(checkDriveIntent, 100);
      voiceStatus('ejecutando', 'info', 'Avanzando hasta obstáculo frontal <= ' + stopCm + ' cm, máx ' + (maxMs / 1000).toFixed(1) + ' s. Di "detente" para cancelar.');
    }

    var timeoutMs = until ? maxMs : (fromVoice ? autoStopMs : 0);
    if (timeoutMs > 0) {
      clearVoiceDrive();
      voiceDriveTimer = setTimeout(function () {
        voiceDriveTimer = null;
        if (driveTimer) {
          stopDrive(false);
          var reason = until ? 'tiempo máximo alcanzado' : 'movimiento por voz detenido';
          log('warn', 'Voz: ' + reason + ' tras ' + (timeoutMs / 1000).toFixed(1) + ' s');
          voiceStatus('auto-stop', 'warn', reason + ' tras ' + (timeoutMs / 1000).toFixed(1) + ' s.');
        }
      }, timeoutMs);
    }
    return true;
  }

  function stopDrive(noSend) {
    clearVoiceDrive();
    clearDriveIntent();
    if (driveTimer) { clearInterval(driveTimer); driveTimer = null; }
    if (!noSend) send(RobotProtocol.drive('stop', 0));
    setDriveActive(null);
  }

  function bindDriveButton(b) {
    var dir = b.getAttribute('data-dir');
    var active = false;

    b._release = function () { active = false; };

    var press = function () {
      if (active) return;
      active = true;
      if (!startDrive(dir)) {
        active = false;
        b.classList.remove('is-held');
      } else if (dir !== 'stop') {
        b.classList.add('is-held');
        heldButton = b;
      }
    };
    var up = function (e) {
      if (e) e.preventDefault();
      if (!active) return;
      active = false;
      b.classList.remove('is-held');
      if (heldButton === b) heldButton = null;
      if (dir !== 'stop') stopDrive(false);
    };

    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (active) return;
      if (b.setPointerCapture && e.pointerId !== undefined) {
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
      }
      press();
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      press();
    });
    b.addEventListener('keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      up(e);
    });
    b.addEventListener('blur', function () { if (active) up(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---------------------------------------------------------------
  // Voz
  // ---------------------------------------------------------------
  function voiceStatus(label, tone, note) {
    setChip(voiceState, label, tone || '');
    if (note) voiceNote.textContent = note;
  }

  function executeVoiceCommand(cmd) {
    if (!cmd) return false;
    if (cmd.t === 'drive' && cmd.dir !== 'stop') {
      var meta = cmd._voice || {};
      var autoStopMs = cmd.until === 'front_obstacle' ? (cmd.max_ms || 8000) : (meta.maxMs || VOICE_DRIVE_MS);
      return startDrive(cmd.dir, {
        source: 'voice',
        speed: cmd.speed,
        autoStopMs: autoStopMs,
        until: cmd.until,
        stopCm: cmd.stop_cm,
        maxMs: cmd.max_ms
      });
    }
    if (cmd.t === 'drive' && cmd.dir === 'stop') {
      stopDrive(false);
      voiceStatus('comando enviado', 'ok', 'Detención enviada.');
      log('voice', 'voz: ' + RobotCommands.describe(cmd));
      return true;
    }
    if (cmd.t === 'estop') {
      stopDrive(true);
    }
    var ok = send(cmd);
    if (ok) {
      voiceStatus('comando enviado', 'ok', 'Comando enviado: ' + RobotCommands.describe(cmd) + '.');
      log('voice', 'voz: ' + RobotCommands.describe(cmd));
    } else {
      voiceStatus('no enviado', 'danger', 'No se pudo enviar. Verifica conexión, modo Manual y E-stop.');
    }
    return ok;
  }

  function setupVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = btnVoice;
    if (!SR) {
      btn.disabled = true;
      voiceStatus('voz no disponible', 'warn', 'Reconocimiento de voz no disponible en este navegador/contexto. Usa localhost/HTTPS y un navegador compatible.');
      return;
    }

    var rec = new SR();
    rec.lang = 'es-CO';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      recognizing = true;
      btn.classList.add('is-listening');
      voiceStatus('escuchando', 'info', 'Escuchando... habla cerca del micrófono.');
    };
    rec.onaudiostart = function () {
      voiceStatus('escuchando', 'info', 'Audio detectado. Pregunta algo a JARVIS o da una orden (adelante, detente, modo manual…).');
    };
    rec.onspeechend = function () {
      voiceStatus('procesando', 'info', 'Procesando audio...');
    };
    rec.onresult = function (e) {
      var text = (e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
      voiceText.textContent = '"' + text + '"';
      handleUtterance(text, 'voz');
    };
    rec.onnomatch = function () {
      voiceStatus('no reconocido', 'warn', 'No se reconoció un comando. Prueba de nuevo.');
      log('warn', 'voz: sin coincidencia');
    };
    rec.onerror = function (e) {
      recognizing = false;
      btn.classList.remove('is-listening');
      var err = e && e.error ? e.error : 'unknown';
      var msg = 'Error de voz: ' + err;
      var tone = 'danger';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        msg = 'Permiso de micrófono denegado o bloqueado. Habilítalo en el navegador.';
      } else if (err === 'no-speech') {
        msg = 'No se detectó voz. Intenta de nuevo cerca del micrófono.';
        tone = 'warn';
      } else if (err === 'audio-capture') {
        msg = 'No se encontró micrófono o no se pudo capturar audio.';
      } else if (err === 'network') {
        msg = 'Error de red del reconocimiento de voz. En Chrome suele requerir internet; si estás en el WiFi del robot (AP), esa red no tiene internet.';
      } else if (err === 'aborted') {
        msg = 'Escucha cancelada.';
        tone = 'warn';
      }
      voiceStatus('error de voz', tone, msg);
      log(tone === 'warn' ? 'warn' : 'error', 'voz: ' + err);
    };
    rec.onend = function () {
      recognizing = false;
      btn.classList.remove('is-listening');
      if (voiceState.textContent === 'escuchando' || voiceState.textContent === 'procesando') {
        voiceStatus('listo', '', 'No se recibió resultado. Intenta de nuevo.');
      }
    };

    btn.onclick = function () {
      if (recognizing) {
        try { rec.abort(); } catch (e) {}
        return;
      }
      if (window.JarvisVoice) JarvisVoice.cancel();   // que JARVIS calle mientras escucha
      try {
        rec.start();
      } catch (err) {
        recognizing = false;
        btn.classList.remove('is-listening');
        voiceStatus('error de voz', 'danger', 'No se pudo iniciar el micrófono: ' + err.message);
        log('error', 'voz: no se pudo iniciar (' + err.message + ')');
      }
    };

    voiceStatus('listo', '', 'Pulsa Hablar y pregúntale a JARVIS (por ejemplo «¿cómo funciona el PWM?») o da una orden (adelante, detente, modo manual). En el WiFi del robot puede fallar por falta de internet.');
  }
  // ---------------------------------------------------------------
  // JARVIS
  // ---------------------------------------------------------------
  function askJarvis(text) {
    var q = (typeof text === 'string' ? text : $('jarvisInput').value).trim();
    if (!q) return;
    $('jarvisInput').value = '';
    handleUtterance(q, 'texto');
  }

  // Una frase (voz o texto) va a JARVIS si es pregunta y al robot si es orden.
  // JARVIS contesta siempre en el chat y en voz alta.
  var autoPanel = null;
  var autoPending = null;      // null | 'strategy' | 'heading': falta elegir por voz
  function openAutoPanel(preset) {
    stopDrive(true);
    if (!preset) autoPending = 'strategy';   // tambien se puede contestar por voz
    autoPanel.open(preset || { strategy: (lastTelemetry.nav || {}).strategy,
                               deg: (lastTelemetry.heading || {}).target });
  }
  function closeAutoPanel() { autoPending = null; if (autoPanel) autoPanel.close(); }

  function handleUtterance(raw, source) {
    var text = String(raw || '').trim();
    if (!text) return;
    addChat('user', text);
    var cmd = null;
    if (!Jarvis.isQuestion(text)) {
      var spoken = Jarvis.stripWake(text);
      if (autoPending) cmd = RobotCommands.autoReply(spoken, autoPending);
      if (!cmd) cmd = RobotCommands.fromText(spoken);
    }
    var missing = RobotCommands.missingFor(cmd);
    var reply;
    if (missing) {
      // Falta el submodo o el rumbo: JARVIS pregunta y el robot no arranca aún.
      autoPending = missing;
      openAutoPanel({ strategy: cmd.strategy });
      reply = Jarvis.askAuto(missing);
      voiceStatus('falta un dato', 'info', reply);
    } else if (cmd) {
      closeAutoPanel();
      if (cmd.t === 'mode') stopDrive(true);
      var ok = executeVoiceCommand(cmd);
      reply = ok ? Jarvis.confirm(cmd)
                 : 'No pude ejecutar la orden. ' + (voiceNote.textContent || 'Verifica la conexión.');
    } else {
      reply = Jarvis.answer(text, lastTelemetry);
      voiceStatus('respondiendo', 'info', 'JARVIS responde a: «' + text + '»');
      log('voice', 'JARVIS (' + source + '): ' + text);
    }
    addChat('jarvis', reply);
    if (window.JarvisVoice) JarvisVoice.speak(reply);
  }
  function addChat(who, text) {
    var el = document.createElement('div');
    el.className = 'msg msg--' + who;
    var name = document.createElement('span');
    name.className = 'msg__who';
    name.textContent = who === 'user' ? 'Tú' : 'JARVIS';
    var body = document.createElement('span');
    body.textContent = text;
    el.appendChild(name);
    el.appendChild(body);
    $('chat').appendChild(el);
    $('chat').scrollTop = $('chat').scrollHeight;
  }

  // ---------------------------------------------------------------
  // Conexion de controles
  // ---------------------------------------------------------------
  function init() {
    $('btnConnect').onclick = function () {
      if (linkState === 'on' || linkState === 'connecting') disconnect();
      else { if (simMode) stopSim(); connect(); }
    };
    $('wsUrl').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && linkState !== 'on' && linkState !== 'connecting') $('btnConnect').click();
    });
    $('chkSim').onchange = function () {
      if (this.checked) { disconnect(); startSim(); }
      else stopSim();
    };

    $('btnManual').onclick = function () {
      closeAutoPanel();
      stopDrive(true);
      send(RobotProtocol.mode('manual'));
    };
    $('btnAuto').onclick = function () {
      openAutoPanel();
    };
    $('btnEstop').onclick = function () {
      send(RobotProtocol.estop());
      stopDrive(true);
    };

    var speed = $('speed');
    var syncSpeed = function () {
      $('speedVal').textContent = speed.value;
      speed.style.setProperty('--range', speed.value + '%');
    };
    speed.addEventListener('input', syncSpeed);
    syncSpeed();

    document.querySelectorAll('button.drive-btn').forEach(bindDriveButton);

    $('btnJarvis').onclick = function () { askJarvis(); };
    $('jarvisInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') askJarvis(); });
    document.querySelectorAll('[data-ask]').forEach(function (b) {
      b.addEventListener('click', function () { askJarvis(b.getAttribute('data-ask')); });
    });

    $('btnClearLog').onclick = function () {
      $('log').textContent = '';
      $('logCount').textContent = '0';
    };
    // En movil el registro arranca plegado para priorizar la conduccion.
    if (window.matchMedia && window.matchMedia('(max-width: 759px)').matches) {
      $('logPanel').open = false;
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && driveTimer) stopDrive(false);
    });

    setInterval(function () {
      if (!connected || !lastTelemetryAt) return;
      var stale = Date.now() - lastTelemetryAt > STALE_MS;
      document.body.classList.toggle('is-stale', stale);
      $('lastUpdate').textContent = stale ? 'sin datos' : formatTime(lastTelemetryAt);
      if (stale) $('telemetryMeta').textContent = 'Telemetría detenida';
    }, 1000);

    autoPanel = AutoPanel.create(document.querySelector('.segmented'), {
      onStart: function (strategy, deg) {
        stopDrive(true);
        autoPending = null;
        return send(RobotProtocol.mode('autonomo', strategy, deg));
      },
      onCancel: function () { autoPending = null; }
    });

    setupVoice();
    addChat('jarvis', 'Hola, soy JARVIS. Pulsa Hablar y pregúntame por el circuito, los pines, la comunicación, los timers o los sensores, o dame una orden para el robot.');
    setConn('off');
    log('ok', 'Interfaz lista. Conecta al robot o activa el modo simulación.');

    // Arranque directo en simulacion: /web/index.html?sim=1
    if (new URLSearchParams(window.location.search).has('sim')) {
      $('chkSim').checked = true;
      startSim();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
