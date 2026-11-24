/* ===========================================================================
 * app.js (v2) — Centro de control del robot móvil ESP32-S3.
 * Mismo contrato de comunicación que la interfaz original:
 * RobotProtocol + RobotCommands + Jarvis (app/shared/*).
 *
 * Reglas de la interfaz:
 *  - Los comandos se envían en el propio evento de puntero/teclado; ninguna
 *    animación se interpone.
 *  - "Detener" y la parada de emergencia nunca se deshabilitan.
 *  - Sin enlace no se muestran datos (guiones), nunca valores inventados.
 *  - La simulación se identifica siempre como tal (azul, "Simulación").
 * =========================================================================== */
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var ws = null;
  var linkState = 'off';        // 'off' | 'connecting' | 'on' | 'sim'
  var connected = false;        // enlace físico abierto
  var simMode = false;
  var simTimer = null;
  var driveTimer = null;
  var voiceDriveTimer = null;
  var heldButton = null;        // botón de conducción mantenido (deadman)
  var lastTelemetry = {};
  var lastTelemetryAt = 0;
  var needleAngle = 0;          // rumbo actual de la aguja (rotación acumulada)
  var targetAngle = 0;          // marca del rumbo deseado (rotación acumulada)
  var voiceReady = false;
  var recognizing = false;
  var logCount = 0;
  var VOICE_DRIVE_MS = 1500;

  // ---------------------------------------------------------------
  // Utilidades de interfaz
  // ---------------------------------------------------------------
  function clock() {
    return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function log(kind, text) {
    var el = document.createElement('div');
    el.className = 'log-line ' + kind;
    var t = document.createElement('time');
    t.textContent = clock();
    var s = document.createElement('span');
    s.textContent = text;
    el.appendChild(t);
    el.appendChild(s);
    $('log').prepend(el);
    while ($('log').children.length > 200) $('log').removeChild($('log').lastChild);
    logCount++;
    $('logLast').textContent = text;
    $('logCount').textContent = String(logCount);
  }

  // Estados: 'off' | 'connecting' | 'on' | 'sim'
  function setConn(state) {
    linkState = state;
    connected = state === 'on';
    document.body.setAttribute('data-link', state);
    $('connDot').className = 'dot ' + state;
    $('connText').textContent = state === 'on' ? 'Conectado'
      : state === 'connecting' ? 'Conectando…'
      : state === 'sim' ? 'Simulación'
      : 'Desconectado';

    var realLink = state === 'on' || state === 'connecting';
    $('btnConnect').textContent = realLink ? 'Desconectar' : 'Conectar';
    $('btnConnect').classList.toggle('is-off', realLink);
    $('wsUrl').disabled = realLink;

    $('telemetrySource').textContent = state === 'on' ? 'Telemetría en vivo del robot'
      : state === 'sim' ? 'Datos simulados · ningún robot conectado'
      : state === 'connecting' ? 'Esperando al robot…'
      : 'Sin datos · robot desconectado';
    $('stageHint').hidden = state !== 'off';

    if (state === 'on' || state === 'sim') toggleSettings(false);
    if (state !== 'on' && state !== 'sim') {
      lastTelemetry = {};
      lastTelemetryAt = 0;
      clearInstruments();
    }
    updateControls();
  }

  function colorCss(name) {
    return ({ negro: '#111111', blanco: '#eeeeee', rojo: '#dd3333', amarillo: '#e5c100',
              verde: '#22aa22', azul: '#2266ff' })[name] || '#666666';
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb.length < 3) return null;
    var h = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.max(0, Math.min(255, Math.round(Number(rgb[i]) || 0)));
      h += ('0' + v.toString(16)).slice(-2);
    }
    return h;
  }

  function isAuto(mode) { return String(mode || '').toLowerCase().indexOf('autonom') === 0; }

  // ---------------------------------------------------------------
  // Paneles plegables
  // ---------------------------------------------------------------
  function toggleSettings(open) {
    var panel = $('settings');
    var want = typeof open === 'boolean' ? open : !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', want);
    $('btnSettings').setAttribute('aria-expanded', want ? 'true' : 'false');
    panel.inert = !want;
  }

  function toggleAssistant(open) {
    var d = $('assistant');
    var want = typeof open === 'boolean' ? open : !d.classList.contains('is-open');
    d.classList.toggle('is-open', want);
    d.inert = !want;
    $('btnAssistant').setAttribute('aria-expanded', want ? 'true' : 'false');
    if (want) setTimeout(function () { $('jarvisInput').focus(); }, 60);
  }

  // ---------------------------------------------------------------
  // Estado de los controles
  // ---------------------------------------------------------------
  function driveLock() {
    var estop = !!lastTelemetry.estop;
    if (linkState === 'connecting') return { text: 'Conectando con el robot…', tone: '' };
    if (!connected && !simMode) return { text: 'Sin conexión', tone: '' };
    if (estop) return { text: 'Parada de emergencia activa', tone: 'danger' };
    if (isAuto(lastTelemetry.mode)) return { text: 'Modo autónomo: el robot navega solo. Pulsa Manual para conducir.', tone: 'info' };
    return null;
  }

  // Habilita/deshabilita controles según conexión y seguridad.
  function updateControls() {
    var estopActive = !!lastTelemetry.estop;
    var linkUp = connected || simMode;
    var lock = driveLock();

    // Un botón mantenido que queda bloqueado se libera ANTES de deshabilitarlo
    // (un botón deshabilitado no recibe pointerup). Se corta el temporizador
    // deadman sin reenviar: lo que bloqueó (estop, cierre, modo) ya implica parada.
    if (lock && heldButton) {
      stopDrive(true);
      releaseHeld();
    }

    document.querySelectorAll('button.drive').forEach(function (b) {
      b.disabled = b.getAttribute('data-dir') !== 'stop' && !!lock;
    });
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.disabled = !linkUp || estopActive;
    });
    // "Hablar" sirve también sin robot: para preguntar a JARVIS.
    if (!driveTimer) showDriveStatus(lock);
  }

  function showDriveStatus(lock, moving) {
    var el = $('driveStatus');
    if (moving) {
      el.textContent = moving + ' · suelta para detener';
      el.className = 'drive-status is-moving';
    } else if (lock) {
      el.textContent = lock.text;
      el.className = 'drive-status' + (lock.tone ? ' is-' + lock.tone : '');
    } else {
      el.textContent = 'Listo · mantén pulsada una flecha';
      el.className = 'drive-status';
    }
  }

  function releaseHeld() {
    if (!heldButton) return;
    var b = heldButton;
    heldButton = null;
    b.classList.remove('pressed');
    if (b._release) b._release();
  }

  // ---------------------------------------------------------------
  // Render de telemetría
  // ---------------------------------------------------------------
  // o === null  -> sin dato (sin enlace): guion
  // o inválido  -> el sensor no devolvió eco
  function sonarRender(root, o) {
    var fill = root.querySelector('.bar-fill');
    var value = root.querySelector('.inst-value');
    var near = root.querySelector('.inst-near');
    var nearOn = false;

    if (o && o.valid && isFinite(o.distance_cm)) {
      var d = Math.max(0, Math.min(200, o.distance_cm));
      fill.style.setProperty('--v', (d / 200).toFixed(3));
      value.textContent = d.toFixed(1);
      var unit = document.createElement('small');
      unit.textContent = 'cm';
      value.appendChild(unit);
      nearOn = o.blocked || d <= 30;
    } else {
      fill.style.setProperty('--v', '0');
      value.textContent = o ? 'sin eco' : '—';
    }
    root.classList.toggle('near', nearOn);
    if (near) {
      near.hidden = !nearOn;
      near.textContent = o && o.blocked ? 'Bloqueado' : 'Cerca';
    }
  }

  // Gira la aguja SIEMPRE por el arco más corto.
  function setNeedle(target) {
    var delta = ((target - needleAngle + 540) % 360) - 180;
    needleAngle += delta;
    $('needle').style.transform = 'rotate(' + needleAngle.toFixed(1) + 'deg)';
  }

  // Marca del rumbo deseado (null = sin rumbo deseado).
  function setTargetMark(target) {
    var mark = $('targetMark');
    if (target === null || target === undefined || !isFinite(target)) {
      mark.classList.add('is-off');
      return;
    }
    var delta = ((target - targetAngle + 540) % 360) - 180;
    targetAngle += delta;
    mark.style.transform = 'rotate(' + targetAngle.toFixed(1) + 'deg)';
    mark.classList.remove('is-off');
  }

  // Envía el rumbo deseado al robot (0–359°). Lo usa el modo Autónomo.
  function setHeadingTarget(deg) {
    deg = Math.round(Number(deg));
    if (!isFinite(deg)) { log('warn', 'Rumbo deseado inválido: escribe un número de 0 a 359.'); return false; }
    deg = ((deg % 360) + 360) % 360;
    if (!send(RobotProtocol.heading(deg))) return false;
    $('targetDeg').value = deg;
    setTargetMark(deg);
    $('headingTarget').textContent = deg.toFixed(1) + '°';
    if (!isAuto(lastTelemetry.mode)) log('ok', 'Rumbo deseado ' + deg + '°: el robot lo seguirá al pasar a modo Autónomo.');
    return true;
  }

  // Ángulo (0–359, 0 = N, sentido horario) del punto tocado en la rosa.
  function compassAngleFromEvent(e) {
    var r = $('targetMark').ownerSVGElement.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2);
    var dy = e.clientY - (r.top + r.height / 2);
    if (dx === 0 && dy === 0) return null;
    return (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
  }

  function motorRender(root, v) {
    var known = v !== null && v !== undefined && isFinite(Number(v));
    v = known ? Math.max(-100, Math.min(100, Number(v))) : 0;
    root.querySelector('.bi-fill').style.setProperty('--m', (v / 100).toFixed(3));
    root.classList.toggle('fwd', v > 0);
    root.classList.toggle('back', v < 0);
    root.querySelector('.inst-value').textContent = known ? (v > 0 ? '+' : '') + v + ' %' : '—';
  }

  function clearInstruments() {
    ['sonarF', 'sonarL', 'sonarR'].forEach(function (id) { sonarRender($(id), null); });
    $('headingRead').textContent = '—';
    $('headingTarget').textContent = '—';
    $('headingError').textContent = '—';
    setTargetMark(null);
    document.querySelector('.compass-wrap').classList.add('off');
    $('colorSwatch').style.background = '';
    $('colorName').textContent = '—';
    $('colorHex').textContent = '';
    motorRender($('motorL'), null);
    motorRender($('motorR'), null);
    $('modeTag').textContent = '—';
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    renderEstop(!!lastTelemetry.estop);
  }

  var STRATEGY_LABEL = { evadir: 'esquivar', rumbo: 'rumbo', linea: 'línea' };
  function strategyLabel(t) {
    var s = isAuto(t.mode) && STRATEGY_LABEL[(t.nav || {}).strategy];
    return s ? ' · ' + s : '';
  }
  var MODE_LABEL = { idle: 'En espera', manual: 'Manual', autonomo: 'Autónomo', safe: 'Seguro', error: 'Error' };

  function renderEstop(active) {
    document.body.classList.toggle('estop-active', active);
    $('estopBanner').hidden = !active;
    $('estopBanner').querySelector('span').textContent = simMode
      ? 'Recarga la página para liberar la parada (simulación).'
      : 'Reinicia la placa del robot para liberar la parada.';
    $('estopTag').textContent = active ? 'E-stop activa' : 'E-stop inactiva';
  }

  function render(t) {
    var wasEstop = !!lastTelemetry.estop;
    lastTelemetry = t || {};
    if (!t) return;
    lastTelemetryAt = Date.now();

    // Modo y e-stop
    $('modeTag').textContent = (MODE_LABEL[t.mode] || String(t.mode || '—')) + strategyLabel(t);
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      var on = t.mode === b.getAttribute('data-mode');
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var estopActive = !!t.estop;
    renderEstop(estopActive);
    if (estopActive && !wasEstop) stopDrive(true);

    // Rumbo
    if (t.heading) {
      var h = t.heading;
      if (h.actual === null || h.actual === undefined) {
        $('headingRead').textContent = '—';
        document.querySelector('.compass-wrap').classList.add('off');
      } else {
        document.querySelector('.compass-wrap').classList.remove('off');
        setNeedle(h.actual);
        $('headingRead').textContent = h.actual.toFixed(1) + '°';
      }
      $('headingTarget').textContent =
        (h.target === null || h.target === undefined) ? '—' : h.target.toFixed(1) + '°';
      setTargetMark(h.target);
      $('headingError').textContent =
        (h.error === null || h.error === undefined) ? '—' : h.error.toFixed(1) + '°';
    }

    // Color
    if (t.color) {
      var valid = !!t.color.valid;
      var hex = valid ? (rgbToHex(t.color.rgb) || colorCss(t.color.name)) : null;
      var name = String(t.color.name || '');
      $('colorSwatch').style.background = valid ? hex : '';
      $('colorName').textContent = valid ? (name.charAt(0).toUpperCase() + name.slice(1) || '—') : 'Sin lectura';
      $('colorHex').textContent = valid ? (hex || '').toUpperCase() : '';
    }

    // Sonares
    sonarRender($('sonarF'), t.obstacle);
    sonarRender($('sonarL'), t.obstacle_left);
    sonarRender($('sonarR'), t.obstacle_right);

    // Motores
    if (t.motors) {
      motorRender($('motorL'), t.motors.left);
      motorRender($('motorR'), t.motors.right);
    }

    checkDriveIntent();
    updateControls();
  }

  // ---------------------------------------------------------------
  // Envío
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
    $('connInfo').hidden = true;
    sock.onopen = function () {
      if (ws !== sock) return;
      setConn('on');
      $('connInfo').textContent = 'Enlace establecido con ' + url;
      $('connInfo').hidden = false;
      log('ok', 'Conectado a ' + url);
      sock.send(RobotProtocol.encode(RobotProtocol.hello()));
    };
    sock.onclose = function () {
      if (ws !== sock) return;     // cierre de un socket ya sustituido
      ws = null;
      stopDrive(true);             // sin enlace: corta el deadman
      setConn('off');
      toggleSettings(true);
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
      else if (m.t === 'event') { log('event', m.code + (m.detail ? ' (' + m.detail + ')' : '')); onDriveEnded(m.code); }
      else if (m.t === 'error') { log('error', m.code + ' ' + (m.detail || '')); onDriveEnded(m.code); }
      else if (m.t === 'pong') log('ok', 'pong');
    };
  }

  // El robot termino un avance "hasta obstaculo": dejar de reenviarlo, para
  // que una lectura que oscile alrededor del limite no lo vuelva a arrancar.
  var DRIVE_END_MSG = {
    OBSTACLE_REACHED: ['obstáculo detectado', 'ok', 'Detenido: obstáculo frontal.'],
    SENSOR_LOST: ['sensor sin lectura', 'warn', 'Detenido: el sensor frontal perdió la lectura.'],
    SENSOR_INVALID: ['sensor sin lectura', 'warn', 'No avanza: el sensor frontal no tiene lectura válida. Revisa el HC-SR04 frontal.'],
    DRIVE_TIMEOUT: ['auto-stop', 'warn', 'Detenido: tiempo máximo alcanzado.']
  };
  function onDriveEnded(code) {
    var info = DRIVE_END_MSG[code];
    if (!info || !driveIntent) return;
    var fromVoice = driveIntent.fromVoice;
    stopDrive(true);
    if (fromVoice) voiceStatus(info[0], info[1], info[2]);
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
  // Modo simulación (sin robot): mismos mensajes que el firmware.
  // ---------------------------------------------------------------
  var sim = {
    mode: 'idle', estop: false,
    heading: { actual: 87.5, target: 90.0, error: -2.5 },
    color: { name: 'verde', rgb: [34, 170, 34], valid: true },
    obstacle: { distance_cm: 34.2, valid: true, blocked: false },
    obstacle_left: { distance_cm: 60.0, valid: true, blocked: false },
    obstacle_right: { distance_cm: 45.0, valid: true, blocked: false },
    motors: { left: 0, right: 0, state: 'stopped' }
  };

  function simTick() {
    if (sim.mode === 'autonomo' && sim.strategy === 'rumbo' && !sim.estop) {
      // Autónomo simulado: gira hacia el rumbo deseado (máx. 4° por ciclo).
      var e = ((sim.heading.target - sim.heading.actual + 540) % 360) - 180;
      sim.heading.actual = (sim.heading.actual + Math.max(-4, Math.min(4, e)) + 360) % 360;
    } else {
      sim.heading.actual = (sim.heading.actual + 0.7) % 360;
    }
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
    log('ok', 'Modo simulación activado (datos de demostración, sin robot)');
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
      }
      else if (cmd.dir === 'back') sim.motors = { left: -cmd.speed, right: -cmd.speed, state: 'moving' };
      else if (cmd.dir === 'left') sim.motors = { left: -cmd.speed, right: cmd.speed, state: 'moving' };
      else if (cmd.dir === 'right') sim.motors = { left: cmd.speed, right: -cmd.speed, state: 'moving' };
      else sim.motors = { left: cmd.speed, right: cmd.speed, state: 'moving' };
    } else if (cmd.t === 'mode') {
      sim.mode = cmd.value;
      sim.strategy = cmd.strategy || null;
      sim.motors = cmd.value === 'autonomo' ? { left: 45, right: 45, state: 'moving' } : { left: 0, right: 0, state: 'stopped' };
      if (cmd.deg !== undefined) sim.heading.target = cmd.deg;
      log('event', RobotCommands.describe(cmd) + ' (simulación)');
    } else if (cmd.t === 'heading') {
      sim.heading.target = cmd.deg;
      log('event', 'rumbo deseado ' + cmd.deg + '° (simulación)');
    } else if (cmd.t === 'estop') {
      sim.estop = true;
      sim.motors = { left: 0, right: 0, state: 'stopped' };
      log('event', 'ESTOP (simulación)');
    }
    return true;
  }

  // ---------------------------------------------------------------
  // Control manual con deadman (puntero y teclado)
  // ---------------------------------------------------------------
  var DIR_LABEL = { fwd: 'Avanzando', back: 'Retrocediendo', left: 'Girando a la izquierda', right: 'Girando a la derecha' };

  var driveIntent = null;
  var driveIntentTimer = null;
  function clearVoiceDrive() { if (voiceDriveTimer) { clearTimeout(voiceDriveTimer); voiceDriveTimer = null; } }
  function clearDriveIntent() { if (driveIntentTimer) { clearInterval(driveIntentTimer); driveIntentTimer = null; } driveIntent = null; }
  function frontObstacleDistance() {
    var o = lastTelemetry.obstacle || {};
    return (o.valid && typeof o.distance_cm === 'number') ? o.distance_cm : null;
  }
  function checkDriveIntent() {
    if (!driveIntent || !driveTimer || driveIntent.until !== 'front_obstacle') return;
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
    if (dir === 'stop') return send(RobotProtocol.drive('stop', 0));

    if (lastTelemetry.estop) { var estopMsg = 'E-stop activo: reinicia la placa antes de mover.'; log('error', estopMsg); if (fromVoice) voiceStatus('bloqueado por E-stop', 'danger', estopMsg); return false; }
    if (isAuto(lastTelemetry.mode)) { var autoMsg = 'Modo autónomo: pulsa Manual antes de mover.'; log('warn', autoMsg); if (fromVoice) voiceStatus('bloqueado por modo', 'warn', autoMsg); return false; }
    if (until === 'front_obstacle' && !lastTelemetry.mode) { var modeMsg = 'Sin telemetría: confirma modo Manual/ARM antes de avanzar hasta obstáculo.'; log('warn', modeMsg); if (fromVoice) voiceStatus('sin estado', 'warn', modeMsg); return false; }
    if (!isFinite(speed) || speed <= 0) { var speedMsg = 'Velocidad en 0 %: sube la velocidad para mover.'; log('warn', speedMsg); if (fromVoice) voiceStatus('velocidad inválida', 'warn', speedMsg); return false; }

    var payload = RobotProtocol.drive(dir, speed, until ? { until: until, stop_cm: stopCm, max_ms: maxMs } : undefined);
    if (!send(payload)) { if (fromVoice) voiceStatus('no enviado', 'danger', 'No se pudo enviar el comando. Verifica conexión y modo Manual.'); return false; }

    driveIntent = until ? { until: until, stopCm: stopCm, maxMs: maxMs, speed: speed, fromVoice: fromVoice } : null;
    driveTimer = setInterval(function () {
      var s = fromVoice ? speed : parseInt($('speed').value, 10);
      send(RobotProtocol.drive(dir, s, until ? { until: until, stop_cm: stopCm, max_ms: maxMs } : undefined), true);
    }, 200);
    showDriveStatus(null, DIR_LABEL[dir]);
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
    showDriveStatus(driveLock());
  }

  function bindDrive(b) {
    var dir = b.getAttribute('data-dir');
    var active = false;
    b._release = function () { active = false; };

    var press = function () {
      if (active) return;
      active = true;
      if (startDrive(dir) && dir !== 'stop') {
        b.classList.add('pressed');
        heldButton = b;
      } else {
        active = dir === 'stop';   // stop: espera al soltar, sin estado verde
      }
    };
    var up = function (e) {
      if (e) e.preventDefault();
      if (!active) return;
      active = false;
      b.classList.remove('pressed');
      if (heldButton === b) heldButton = null;
      if (dir !== 'stop') stopDrive(false);
    };

    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (b.setPointerCapture && e.pointerId !== undefined) {
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
      }
      press();
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('blur', function () { if (active) up(null); });
    b.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    });
    b.addEventListener('keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      up(e);
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---------------------------------------------------------------
  // Voz
  // ---------------------------------------------------------------
  function voiceStatus(label, tone, note) {
    var chip = voiceState;
    if (chip) {
      chip.textContent = label;
      chip.className = 'status' + (tone ? ' status--' + tone : '');
    }
    if (note) voiceNote.textContent = note;
  }

  function executeVoiceCommand(cmd) {
    if (!cmd) return false;
    if (cmd.t === 'drive' && cmd.dir !== 'stop') {
      var meta = cmd._voice || {};
      var autoStopMs = cmd.until === 'front_obstacle' ? (cmd.max_ms || 8000) : (meta.maxMs || VOICE_DRIVE_MS);
      return startDrive(cmd.dir, {
        source: 'voice', speed: cmd.speed, autoStopMs: autoStopMs,
        until: cmd.until, stopCm: cmd.stop_cm, maxMs: cmd.max_ms
      });
    }
    if (cmd.t === 'drive' && cmd.dir === 'stop') {
      stopDrive(false);
      voiceStatus('comando enviado', 'ok', 'Detención enviada.');
      log('voice', 'voz: ' + RobotCommands.describe(cmd));
      return true;
    }
    if (cmd.t === 'heading') {
      // Mismo camino que la brújula: actualiza la marca, el objetivo y el campo.
      var sent = setHeadingTarget(cmd.deg);
      if (sent) {
        voiceStatus('comando enviado', 'ok', 'Rumbo deseado ' + Math.round(cmd.deg) + '°' +
          (isAuto(lastTelemetry.mode) ? '.' : '. Pulsa Autónomo para que el robot lo siga.'));
        log('voice', 'voz: ' + RobotCommands.describe(cmd));
      } else {
        voiceStatus('no enviado', 'danger', 'No se pudo enviar el rumbo. Verifica la conexión y el E-stop.');
      }
      return sent;
    }
    if (cmd.t === 'estop') stopDrive(true);
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
      if (btn) btn.disabled = true;
      voiceStatus('voz no disponible', 'warn', 'Reconocimiento de voz no disponible en este navegador/contexto. Usa localhost/HTTPS y un navegador compatible.');
      return;
    }
    voiceReady = true;
    var rec = new SR();
    rec.lang = 'es-CO';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      recognizing = true;
      btn.classList.add('listening');
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
      btn.classList.remove('listening');
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
      btn.classList.remove('listening');
      var note = voiceNote.textContent || '';
      if (note.indexOf('Escuchando') !== -1 || note.indexOf('Procesando') !== -1) {
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
        btn.classList.remove('listening');
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
    el.className = 'chat-line ' + who;
    el.textContent = text;
    $('chat').appendChild(el);
    $('chat').scrollTop = $('chat').scrollHeight;
  }

  // ---------------------------------------------------------------
  // Conexión de controles
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

    $('btnSettings').onclick = function () { toggleSettings(); };
    $('btnAssistant').onclick = function () { toggleAssistant(); };
    $('btnAssistantClose').onclick = function () { toggleAssistant(false); $('btnAssistant').focus(); };
    $('hintConnect').onclick = function () { toggleSettings(true); $('wsUrl').focus(); };
    $('hintSim').onclick = function () { $('chkSim').checked = true; $('chkSim').onchange.call($('chkSim')); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('assistant').classList.contains('is-open')) toggleAssistant(false);
    });

    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute('data-mode') === 'autonomo') { openAutoPanel(); return; }
        closeAutoPanel();
        stopDrive(true);
        send(RobotProtocol.mode('manual'));
      };
    });
    document.querySelectorAll('[data-estop]').forEach(function (b) {
      b.onclick = function () { send(RobotProtocol.estop()); stopDrive(true); };
    });

    // Rumbo deseado: campo + botón, accesos N/E/S/O y toque sobre la rosa
    $('targetForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('targetDeg').value.trim();
      if (v === '') { $('targetDeg').focus(); return; }
      setHeadingTarget(v);
    });
    document.querySelectorAll('[data-target]').forEach(function (b) {
      b.onclick = function () { setHeadingTarget(b.getAttribute('data-target')); };
    });
    $('targetMark').ownerSVGElement.addEventListener('click', function (e) {
      var deg = compassAngleFromEvent(e);
      if (deg !== null) setHeadingTarget(deg);
    });

    var speed = $('speed');
    var syncSpeed = function () {
      $('speedVal').textContent = speed.value + ' %';
      speed.style.setProperty('--range', speed.value + '%');
    };
    speed.addEventListener('input', syncSpeed);
    syncSpeed();

    document.querySelectorAll('button.drive').forEach(bindDrive);

    // Si la pestaña pierde visibilidad, corta el movimiento (deadman)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && driveTimer) stopDrive(false);
    });

    // Telemetría congelada con enlace abierto
    setInterval(function () {
      if (linkState !== 'on' || !lastTelemetryAt) return;
      if (Date.now() - lastTelemetryAt > 2500) $('telemetrySource').textContent = 'Telemetría detenida · sin datos recientes';
      else $('telemetrySource').textContent = 'Telemetría en vivo del robot';
    }, 1000);

    $('btnJarvis').onclick = function () { askJarvis(); };
    $('jarvisInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') askJarvis(); });
    document.querySelectorAll('[data-ask]').forEach(function (b) {
      b.onclick = function () { askJarvis(b.getAttribute('data-ask')); };
    });

    autoPanel = AutoPanel.create(document.querySelector('.modes'), {
      onStart: function (strategy, deg) {
        stopDrive(true);
        autoPending = null;
        return send(RobotProtocol.mode('autonomo', strategy, deg));
      },
      onCancel: function () { autoPending = null; }
    });

    setupVoice();
    addChat('jarvis', 'Hola, soy JARVIS. Pulsa Hablar y pregúntame por el circuito, los pines, la comunicación, los timers o los sensores, o dame una orden para el robot.');
    toggleAssistant(false);
    setConn('off');
    log('ok', 'Consola lista (v2). Conecta al robot o activa el modo simulación.');

    // Arranque directo en simulación: /web/v2/index.html?sim=1
    if (new URLSearchParams(window.location.search).has('sim')) {
      $('chkSim').checked = true;
      startSim();
    } else {
      toggleSettings(true);   // sin enlace: la conexión es lo primero que hace falta
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
