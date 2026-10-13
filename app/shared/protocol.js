/* ===========================================================================
 * protocol.js - Protocolo v1 (cliente <-> ESP32-S3).
 * Espejo en JavaScript de docs/protocolo_comunicacion.md y del modulo
 * Protocol del firmware. Logica PURA (sin DOM, sin red): se puede probar en
 * Node (tests/host/test_protocol.js) y usar en el navegador.
 *
 * Patron UMD: exporta a window.RobotProtocol o module.exports.
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RobotProtocol = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROTOCOL_VERSION = 1;
  var COMMAND_TTL_MS = 500;         // caducidad (deadman) de un comando drive
  var TELEMETRY_PERIOD_MS = 200;

  var ERR = {
    BAD_FORMAT: 'BAD_FORMAT',
    UNKNOWN_CMD: 'UNKNOWN_CMD',
    UNSUPPORTED: 'UNSUPPORTED',
    SAFETY: 'SAFETY',
    I2C_ERROR: 'I2C_ERROR',
    SENSOR_INVALID: 'SENSOR_INVALID',
    VERSION_MISMATCH: 'VERSION_MISMATCH'
  };

  var CLIENT_TYPES = ['hello', 'ping', 'mode', 'drive', 'heading', 'calib', 'estop', 'status'];
  var DRIVE_DIRS = ['fwd', 'back', 'left', 'right', 'stop'];
  var MODES = ['manual', 'autonomo'];

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function errorMsg(code, detail) {
    return { t: 'error', v: PROTOCOL_VERSION, code: code, detail: detail || '' };
  }

  function fail(code, detail) {
    return { ok: false, error: errorMsg(code, detail) };
  }

  // Valida un mensaje ya parseado. Devuelve {ok, msg} o {ok:false, error}.
  function validate(msg) {
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
      return fail(ERR.BAD_FORMAT, 'mensaje no es un objeto');
    }
    if (typeof msg.t !== 'string' || msg.t.length === 0) {
      return fail(ERR.BAD_FORMAT, "falta el campo 't'");
    }
    if (CLIENT_TYPES.indexOf(msg.t) === -1) {
      return fail(ERR.UNKNOWN_CMD, "t='" + msg.t + "'");
    }
    if (msg.v !== PROTOCOL_VERSION) {
      return fail(ERR.VERSION_MISMATCH, 'v=' + msg.v);
    }

    switch (msg.t) {
      case 'hello':
        break;
      case 'ping':
      case 'estop':
      case 'status':
        break;
      case 'mode':
        if (MODES.indexOf(msg.value) === -1) {
          return fail(ERR.BAD_FORMAT, "mode.value='" + msg.value + "'");
        }
        break;
      case 'drive':
        if (DRIVE_DIRS.indexOf(msg.dir) === -1) {
          return fail(ERR.BAD_FORMAT, "drive.dir='" + msg.dir + "'");
        }
        if (msg.speed !== undefined && (!isInt(msg.speed) || msg.speed < 0 || msg.speed > 100)) {
          return fail(ERR.BAD_FORMAT, 'drive.speed fuera de 0..100');
        }
        break;
      case 'heading':
        if (!isNum(msg.deg) || msg.deg < 0 || msg.deg >= 360) {
          return fail(ERR.BAD_FORMAT, 'heading.deg fuera de [0,360)');
        }
        break;
      case 'calib':
        if (['compass', 'color'].indexOf(msg.what) === -1 ||
            ['start', 'save'].indexOf(msg.action) === -1) {
          return fail(ERR.BAD_FORMAT, 'calib.what/action invalidos');
        }
        break;
      default:
        return fail(ERR.UNKNOWN_CMD, "t='" + msg.t + "'");
    }
    return { ok: true, msg: msg };
  }

  // Parsea texto JSON y lo valida. Nunca lanza.
  function parse(raw) {
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return fail(ERR.BAD_FORMAT, 'JSON invalido');
    }
    return validate(msg);
  }

  // Serializa un mensaje validado a texto.
  function encode(msg) { return JSON.stringify(msg); }

  // --- Constructores de comandos (cliente -> robot) ------------------------
  function hello() { return { t: 'hello', v: PROTOCOL_VERSION }; }
  function ping() { return { t: 'ping', v: PROTOCOL_VERSION }; }
  function mode(value) { return { t: 'mode', v: PROTOCOL_VERSION, value: value }; }
  function drive(dir, speed) {
    return { t: 'drive', v: PROTOCOL_VERSION, dir: dir, speed: speed === undefined ? 60 : speed, ts: Date.now() };
  }
  function heading(deg) { return { t: 'heading', v: PROTOCOL_VERSION, deg: deg }; }
  function estop() { return { t: 'estop', v: PROTOCOL_VERSION }; }

  // --- Constructores de respuestas (robot -> cliente) ----------------------
  function helloAck() { return { t: 'hello_ack', v: PROTOCOL_VERSION }; }
  function pong() { return { t: 'pong', v: PROTOCOL_VERSION }; }
  function ack(of, value) {
    var m = { t: 'ack', v: PROTOCOL_VERSION, of: of };
    if (value !== undefined) m.value = value;
    return m;
  }
  function telemetry(obj) {
    var m = { t: 'telemetry', v: PROTOCOL_VERSION, ts: Date.now() };
    for (var k in obj) if (obj.hasOwnProperty(k)) m[k] = obj[k];
    return m;
  }
  function eventMsg(code, detail) {
    return { t: 'event', v: PROTOCOL_VERSION, ts: Date.now(), code: code, detail: detail || '' };
  }

  // Deadman: indica si un comando con marca `ts` sigue vigente.
  function isFresh(ts, now, ttl) {
    if (!isNum(ts)) return false;
    now = isNum(now) ? now : Date.now();
    ttl = isNum(ttl) ? ttl : COMMAND_TTL_MS;
    return (now - ts) <= ttl;
  }

  return {
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    COMMAND_TTL_MS: COMMAND_TTL_MS,
    TELEMETRY_PERIOD_MS: TELEMETRY_PERIOD_MS,
    ERROR: ERR,
    CLIENT_TYPES: CLIENT_TYPES,
    DRIVE_DIRS: DRIVE_DIRS,
    MODES: MODES,
    validate: validate,
    parse: parse,
    encode: encode,
    error: errorMsg,
    hello: hello,
    ping: ping,
    mode: mode,
    drive: drive,
    heading: heading,
    estop: estop,
    helloAck: helloAck,
    pong: pong,
    ack: ack,
    telemetry: telemetry,
    event: eventMsg,
    isFresh: isFresh
  };
});
