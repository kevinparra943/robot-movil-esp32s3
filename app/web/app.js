/* ===========================================================================
 * app.js - Interfaz de control y monitorizacion (RF-08).
 * Usa RobotProtocol, RobotCommands y Jarvis (app/shared/*).
 * Incluye modo simulacion para probar la interfaz sin robot.
 * =========================================================================== */
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var ws = null;
  var connected = false;
  var simMode = false;
  var simTimer = null;
  var driveTimer = null;
  var lastTelemetry = {};

  // ---------------------------------------------------------------
  // Utilidades de interfaz
  // ---------------------------------------------------------------
  function log(kind, text) {
    var el = document.createElement('div');
    el.className = 'log-line ' + kind;
    var t = new Date().toLocaleTimeString();
    el.textContent = '[' + t + '] ' + text;
    $('log').prepend(el);
    while ($('log').children.length > 200) $('log').removeChild($('log').lastChild);
  }

  function setConn(state, text) {
    connected = state === true;
    $('connDot').className = 'dot ' + (state ? 'on' : 'off');
    $('connText').textContent = text;
  }

  function colorCss(name) {
    return ({ negro: '#111', blanco: '#eee', rojo: '#e33', amarillo: '#e5c100',
              verde: '#2a2', azul: '#26f' })[name] || '#666';
  }

  // ---------------------------------------------------------------
  // Render de telemetria
  // ---------------------------------------------------------------
  function render(t) {
    lastTelemetry = t || {};
    if (!t) return;
    $('tMode').textContent = t.mode || '—';

    if (t.heading) {
      $('tHeading').textContent = (t.heading.actual === null || t.heading.actual === undefined) ? 'sin dato' : t.heading.actual.toFixed(1) + '°';
      $('tTarget').textContent = (t.heading.target === null || t.heading.target === undefined) ? '—' : t.heading.target.toFixed(1) + '°';
      $('tError').textContent = (t.heading.error === null || t.heading.error === undefined) ? '—' : t.heading.error.toFixed(1) + '°';
    }
    if (t.color) {
      $('tColor').textContent = t.color.valid ? t.color.name : 'sin dato';
      $('swatch').style.background = t.color.valid ? colorCss(t.color.name) : '#666';
    }
    if (t.obstacle) {
      $('tDist').textContent = t.obstacle.valid ? t.obstacle.distance_cm.toFixed(1) + ' cm' + (t.obstacle.blocked ? ' ⚠' : '') : 'sin eco';
    }
    if (t.motors) {
      $('tLeft').textContent = t.motors.left + '%';
      $('tRight').textContent = t.motors.right + '%';
    }
    $('tEstop').textContent = t.estop ? 'ACTIVA' : 'inactiva';
  }

  // ---------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------
  function send(cmd, silent) {
    if (!cmd) return;
    if (simMode) { simHandle(cmd, silent); return; }
    if (!connected || !ws || ws.readyState !== 1) {
      log('warn', 'No conectado: ' + RobotCommands.describe(cmd));
      return;
    }
    ws.send(RobotProtocol.encode(cmd));
    if (!silent) log('out', '→ ' + RobotCommands.describe(cmd));
  }

  // ---------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------
  function connect() {
    var url = $('wsUrl').value.trim();
    if (!url) return;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      log('error', 'URL inválida: ' + url);
      return;
    }

    setConn(false, 'Conectando…');
    ws.onopen = function () {
      setConn(true, 'Conectado');
      $('connInfo').textContent = 'Enlace establecido con ' + url;
      log('ok', 'Conectado a ' + url);
      ws.send(RobotProtocol.encode(RobotProtocol.hello()));
    };
    ws.onclose = function () {
      setConn(false, 'Desconectado');
      log('warn', 'Conexión cerrada');
    };
    ws.onerror = function () {
      log('error', 'Error de conexión');
    };
    ws.onmessage = function (ev) {
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
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    setConn(false, 'Desconectado');
  }

  // ---------------------------------------------------------------
  // Modo simulacion (sin robot)
  // ---------------------------------------------------------------
  var sim = {
    mode: 'idle', estop: false,
    heading: { actual: 87.5, target: 90.0, error: -2.5 },
    color: { name: 'verde', rgb: [120, 200, 90], valid: true },
    obstacle: { distance_cm: 34.2, valid: true, blocked: false },
    motors: { left: 0, right: 0, state: 'stopped' }
  };

  function startSim() {
    simMode = true;
    setConn(true, 'Simulación');
    log('ok', 'Modo simulación activado');
    simTimer = setInterval(function () {
      sim.heading.actual = (sim.heading.actual + 0.7) % 360;
      sim.heading.error = ((sim.heading.target - sim.heading.actual + 540) % 360) - 180;
      sim.obstacle.distance_cm = Math.max(5, 30 + 10 * Math.sin(Date.now() / 1500));
      sim.obstacle.blocked = sim.obstacle.distance_cm < 25;
      render(RobotProtocol.telemetry({
        mode: sim.mode, conn: true, heading: sim.heading, color: sim.color,
        obstacle: sim.obstacle, motors: sim.motors, nav: { state: 'SIM', level: 1 }, estop: sim.estop
      }));
    }, 200);
  }

  function stopSim() {
    simMode = false;
    if (simTimer) clearInterval(simTimer);
    simTimer = null;
    setConn(false, 'Desconectado');
  }

  function simHandle(cmd) {
    if (sim.estop && ['drive', 'mode', 'heading'].indexOf(cmd.t) !== -1) {
      log('error', 'SAFETY: estop activo (simulación)');
      return;
    }
    if (cmd.t === 'drive') {
      if (cmd.dir === 'stop') sim.motors = { left: 0, right: 0, state: 'stopped' };
      else sim.motors = { left: cmd.speed, right: cmd.speed, state: 'moving' };
    } else if (cmd.t === 'mode') {
      sim.mode = cmd.value;
    } else if (cmd.t === 'estop') {
      sim.estop = true;
      sim.motors = { left: 0, right: 0, state: 'stopped' };
      log('event', 'ESTOP (simulación)');
    }
  }

  // ---------------------------------------------------------------
  // Control manual con deadman
  // ---------------------------------------------------------------
  function startDrive(dir) {
    stopDrive(true);
    var speed = parseInt($('speed').value, 10);
    var cmd = (dir === 'stop') ? RobotProtocol.drive('stop', 0) : RobotProtocol.drive(dir, speed);
    send(cmd);
    if (dir !== 'stop') {
      driveTimer = setInterval(function () {
        send(RobotProtocol.drive(dir, parseInt($('speed').value, 10)), true);
      }, 200);
    }
  }
  function stopDrive(noSend) {
    if (driveTimer) { clearInterval(driveTimer); driveTimer = null; }
    if (!noSend) send(RobotProtocol.drive('stop', 0));
  }

  // ---------------------------------------------------------------
  // Voz
  // ---------------------------------------------------------------
  function setupVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      $('btnVoice').disabled = true;
      $('voiceNote').textContent = 'Reconocimiento de voz no disponible aquí. Usa los botones. (Requiere servir la página por localhost o HTTPS.)';
      return;
    }
    var rec = new SR();
    rec.lang = 'es-CO';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var text = e.results[0][0].transcript;
      $('voiceText').textContent = '“' + text + '”';
      var cmd = RobotCommands.fromText(text);
      if (cmd) { log('voice', 'voz: ' + RobotCommands.describe(cmd)); send(cmd); }
      else log('warn', 'voz no reconocida: ' + text);
    };
    rec.onerror = function (e) { log('error', 'voz: ' + e.error); };
    $('btnVoice').onclick = function () {
      try { rec.start(); $('voiceNote').textContent = 'Escuchando…'; }
      catch (err) { $('voiceNote').textContent = 'No se pudo iniciar el micrófono.'; }
    };
    $('voiceNote').textContent = 'Pulsa "Hablar" y di: adelante, atrás, izquierda, derecha, detente, modo manual…';
  }

  // ---------------------------------------------------------------
  // JARVIS
  // ---------------------------------------------------------------
  function askJarvis() {
    var q = $('jarvisInput').value.trim();
    if (!q) return;
    $('jarvisInput').value = '';
    addChat('user', q);
    var a = Jarvis.answer(q, lastTelemetry);
    addChat('jarvis', a);
  }
  function addChat(who, text) {
    var el = document.createElement('div');
    el.className = 'chat-line ' + who;
    el.textContent = (who === 'user' ? 'Tú: ' : 'JARVIS: ') + text;
    $('chat').appendChild(el);
    $('chat').scrollTop = $('chat').scrollHeight;
  }

  // ---------------------------------------------------------------
  // Conexion de controles
  // ---------------------------------------------------------------
  function init() {
    $('btnConnect').onclick = function () {
      if (connected && !simMode) disconnect();
      else { if (simMode) stopSim(); connect(); }
    };
    $('chkSim').onchange = function () {
      if (this.checked) { disconnect(); startSim(); }
      else stopSim();
    };

    $('btnManual').onclick = function () { send(RobotProtocol.mode('manual')); };
    $('btnAuto').onclick = function () { send(RobotProtocol.mode('autonomo')); };
    $('btnIdle').onclick = function () { send(RobotProtocol.drive('stop', 0)); };
    $('btnEstop').onclick = function () { send(RobotProtocol.estop()); };

    $('speed').oninput = function () { $('speedVal').textContent = this.value; };

    var driveBtns = document.querySelectorAll('button.drive');
    driveBtns.forEach(function (b) {
      var dir = b.getAttribute('data-dir');
      var down = function (e) { e.preventDefault(); startDrive(dir); };
      var up = function (e) { e.preventDefault(); if (dir !== 'stop') stopDrive(false); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    });

    $('btnJarvis').onclick = askJarvis;
    $('jarvisInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') askJarvis(); });

    setupVoice();
    addChat('jarvis', 'Hola, soy JARVIS. Pregúntame por el proyecto, el rumbo, el color o la distancia.');
    log('ok', 'Interfaz lista. Conecta al robot o activa el modo simulación.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
