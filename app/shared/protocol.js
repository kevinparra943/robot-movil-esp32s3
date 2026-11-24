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
  var DRIVE_UNTIL = ['front_obstacle'];
  var DRIVE_STOP_CM_MIN = 5;
  var DRIVE_STOP_CM_MAX = 30;
  var DRIVE_STOP_CM_DEFAULT = 10;
  var DRIVE_MAX_MS_MIN = 500;
  var DRIVE_MAX_MS_MAX = 15000;
  var DRIVE_MAX_MS_DEFAULT = 8000;

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
  var ROBOT_TYPES = ['hello_ack', 'pong', 'ack', 'telemetry', 'event', 'error', 'status'];
  var DRIVE_DIRS = ['fwd', 'back', 'left', 'right', 'stop'];
  var MODES = ['manual', 'autonomo'];
  var STRATEGIES = ['evadir', 'rumbo', 'linea'];   // submodos de autonomo

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function errorMsg(code, detail) {
    return { t: 'error', v: PROTOCOL_VERSION, code: code, detail: detail || '' };
  }

  function fail(code, detail) {
    return { ok: false, error: errorMsg(code, detail) };
  }

  function checkBase(msg) {
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
      return fail(ERR.BAD_FORMAT, 'mensaje no es un objeto');
    }
    if (typeof msg.t !== 'string' || msg.t.length === 0) {
      return fail(ERR.BAD_FORMAT, "falta el campo 't'");
    }
    if (msg.v !== PROTOCOL_VERSION) {
      return fail(ERR.VERSION_MISMATCH, 'v=' + msg.v);
    }
    return { ok: true };
  }

  // Valida un mensaje cliente -> robot (comandos).
  function validateClient(msg) {
    var base = checkBase(msg);
    if (!base.ok) return base;
    if (CLIENT_TYPES.indexOf(msg.t) === -1) {
      return fail(ERR.UNKNOWN_CMD, "t='" + msg.t + "'");
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
        if (msg.value === 'autonomo') {
          if (STRATEGIES.indexOf(msg.strategy) === -1) {
            return fail(ERR.BAD_FORMAT, "mode.strategy='" + msg.strategy + "'");
          }
          if (msg.deg !== undefined) {
            if (msg.strategy !== 'rumbo') {
              return fail(ERR.BAD_FORMAT, 'mode.deg solo aplica a strategy=rumbo');
            }
            if (!isNum(msg.deg) || msg.deg < 0 || msg.deg >= 360) {
              return fail(ERR.BAD_FORMAT, 'mode.deg fuera de [0,360)');
            }
          }
        } else if (msg.strategy !== undefined || msg.deg !== undefined) {
          return fail(ERR.BAD_FORMAT, 'mode.strategy/deg requiere autonomo');
        }
        break;
      case 'drive':
        if (DRIVE_DIRS.indexOf(msg.dir) === -1) {
          return fail(ERR.BAD_FORMAT, "drive.dir='" + msg.dir + "'");
        }
        if (msg.speed !== undefined && (!isInt(msg.speed) || msg.speed < 0 || msg.speed > 100)) {
          return fail(ERR.BAD_FORMAT, 'drive.speed fuera de 0..100');
        }
        if (msg.until !== undefined) {
          if (DRIVE_UNTIL.indexOf(msg.until) === -1) {
            return fail(ERR.BAD_FORMAT, "drive.until='" + msg.until + "'");
          }
          if (msg.dir !== 'fwd') {
            return fail(ERR.BAD_FORMAT, 'drive.until solo aplica a dir=fwd');
          }
        }
        if (msg.stop_cm !== undefined) {
          if (!isNum(msg.stop_cm) || msg.stop_cm < DRIVE_STOP_CM_MIN || msg.stop_cm > DRIVE_STOP_CM_MAX) {
            return fail(ERR.BAD_FORMAT, 'drive.stop_cm fuera de 5-30');
          }
        }
        if (msg.max_ms !== undefined) {
          if (!isInt(msg.max_ms) || msg.max_ms < DRIVE_MAX_MS_MIN || msg.max_ms > DRIVE_MAX_MS_MAX) {
            return fail(ERR.BAD_FORMAT, 'drive.max_ms fuera de 500-15000');
          }
        }
        if (msg.until === undefined && (msg.stop_cm !== undefined || msg.max_ms !== undefined)) {
          return fail(ERR.BAD_FORMAT, 'drive.stop_cm/max_ms requiere until');
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

  // Valida un mensaje robot -> cliente (respuestas y telemetria).
  function validateRobot(msg) {
    var base = checkBase(msg);
    if (!base.ok) return base;
    if (ROBOT_TYPES.indexOf(msg.t) === -1) {
      return fail(ERR.UNKNOWN_CMD, "t='" + msg.t + "'");
    }

    switch (msg.t) {
      case 'hello_ack':
      case 'pong':
      case 'status':
        break;
      case 'ack':
        if (typeof msg.of !== 'string' || msg.of.length === 0) {
          return fail(ERR.BAD_FORMAT, "falta el campo 'of' del ack");
        }
        break;
      case 'telemetry':
        if (msg.ts !== undefined && !isNum(msg.ts)) {
          return fail(ERR.BAD_FORMAT, 'telemetry.ts no es numerico');
        }
        break;
      case 'event':
      case 'error':
        if (typeof msg.code !== 'string' || msg.code.length === 0) {
          return fail(ERR.BAD_FORMAT, "falta el campo 'code'");
        }
        break;
      default:
        return fail(ERR.UNKNOWN_CMD, "t='" + msg.t + "'");
    }
    return { ok: true, msg: msg };
  }

  // Valida en cualquier direccion. El tipo de mensaje decide el validador.
  function validate(msg) {
    if (msg !== null && typeof msg === 'object' && typeof msg.t === 'string') {
      if (ROBOT_TYPES.indexOf(msg.t) !== -1) return validateRobot(msg);
      if (CLIENT_TYPES.indexOf(msg.t) !== -1) return validateClient(msg);
    }
    return validateClient(msg);
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
  // mode('manual') | mode('autonomo', 'evadir'|'linea') | mode('autonomo', 'rumbo', 90)
  function mode(value, strategy, deg) {
    var m = { t: 'mode', v: PROTOCOL_VERSION, value: value };
    if (strategy) m.strategy = strategy;
    if (deg !== undefined && deg !== null) m.deg = deg;
    return m;
  }
  function drive(dir, speed, opts) {
    var m = { t: 'drive', v: PROTOCOL_VERSION, dir: dir, speed: speed === undefined ? 60 : speed, ts: Date.now() };
    if (opts && opts.until) {
      m.until = opts.until;
      m.stop_cm = opts.stop_cm === undefined ? DRIVE_STOP_CM_DEFAULT : opts.stop_cm;
      m.max_ms = opts.max_ms === undefined ? DRIVE_MAX_MS_DEFAULT : opts.max_ms;
    }
    return m;
  }
  function heading(deg) { return { t: 'heading', v: PROTOCOL_VERSION, deg: deg }; }
  function calib(what, action) {
    return { t: 'calib', v: PROTOCOL_VERSION, what: what, action: action };
  }
  function estop() { return { t: 'estop', v: PROTOCOL_VERSION }; }
  function status() { return { t: 'status', v: PROTOCOL_VERSION }; }

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
    ROBOT_TYPES: ROBOT_TYPES,
    DRIVE_DIRS: DRIVE_DIRS,
    DRIVE_UNTIL: DRIVE_UNTIL,
    DRIVE_STOP_CM_MIN: DRIVE_STOP_CM_MIN,
    DRIVE_STOP_CM_MAX: DRIVE_STOP_CM_MAX,
    DRIVE_STOP_CM_DEFAULT: DRIVE_STOP_CM_DEFAULT,
    DRIVE_MAX_MS_MIN: DRIVE_MAX_MS_MIN,
    DRIVE_MAX_MS_MAX: DRIVE_MAX_MS_MAX,
    DRIVE_MAX_MS_DEFAULT: DRIVE_MAX_MS_DEFAULT,
    MODES: MODES,
    STRATEGIES: STRATEGIES,
    validate: validate,
    validateClient: validateClient,
    validateRobot: validateRobot,
    parse: parse,
    encode: encode,
    error: errorMsg,
    hello: hello,
    ping: ping,
    mode: mode,
    drive: drive,
    heading: heading,
    calib: calib,
    estop: estop,
    status: status,
    helloAck: helloAck,
    pong: pong,
    ack: ack,
    telemetry: telemetry,
    event: eventMsg,
    isFresh: isFresh
  };
});
