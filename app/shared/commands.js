/* ===========================================================================
 * commands.js - Mapeo de voz/texto a comandos del protocolo (RF-02).
 * Logica PURA (sin DOM, sin reconocimiento). El reconocimiento de voz vive en
 * app.js; aqui solo se interpreta el TEXTO ya reconocido.
 * UMD: window.RobotCommands o module.exports.
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./protocol.js'));
  } else {
    root.RobotCommands = factory(root.RobotProtocol);
  }
})(typeof self !== 'undefined' ? self : this, function (Protocol) {
  'use strict';

  // Quita acentos y normaliza.
  function normalize(text) {
    if (!text) return '';
    var s = String(text).toLowerCase().trim();
    // Descompone y elimina diacriticos.
    if (s.normalize) {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    s = s.replace(/[.,;:!?¡¿"]/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  function containsAny(s, words) {
    for (var i = 0; i < words.length; i++) {
      if (s.indexOf(words[i]) !== -1) return true;
    }
    return false;
  }

  var W = {
    estop: ['parada de emergencia', 'emergencia', 'emergency', 'emergencia total', 'frenado de emergencia', 'detener todo', 'para todo'],
    stop: ['detente', 'detener', 'parar', 'para', 'alto', 'stop', 'frena', 'frenar', 'detenerse', 'quieto', 'quieta', 'parate'],
    forward: ['adelante', 'avanza', 'avanzar', 'avanzando', 'sigue', 'seguir', 'frente', 'recto', 'derecho', 'forward', 've hacia adelante', 'muevete hacia adelante', 'camina'],
    back: ['atras', 'retrocede', 'retroceder', 'retrocediendo', 'reversa', 'reversa', 'back', 'reverse', 've hacia atras', 'muevete hacia atras', 'echa para atras'],
    left: ['izquierda', 'left', 'gira a la izquierda', 'gira izquierda', 'rota izquierda', 'voltea a la izquierda'],
    right: ['derecha', 'right', 'gira a la derecha', 'gira derecha', 'rota derecha', 'voltea a la derecha'],
    manual: ['modo manual', 'manual', 'control manual'],
    auto: ['modo autonomo', 'autonomo', 'automatico', 'modo automatico', 'piloto automatico', 'automatic']
  };

  var SPEED_WORDS = {
    slow: { words: ['lento', 'lenta', 'despacio', 'suave', 'slow'], value: 30 },
    medium: { words: ['medio', 'media', 'normal', 'moderado', 'moderada'], value: 60 },
    fast: { words: ['rapido', 'rapida', 'fuerte', 'veloz', 'fast'], value: 85 }
  };

  function tokenize(s) {
    return s ? s.split(/\s+/).filter(Boolean) : [];
  }

  function hasToken(tokens, word) {
    return tokens.indexOf(word) !== -1;
  }

  function containsPhrase(s, phrase) {
    if (!phrase) return false;
    if (phrase.indexOf(' ') !== -1) return s.indexOf(phrase) !== -1;
    var re = new RegExp('(^|\\s)' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)');
    return re.test(s);
  }

  function containsAnyPhrase(s, words) {
    for (var i = 0; i < words.length; i++) {
      if (containsPhrase(s, words[i])) return true;
    }
    return false;
  }

  function extractSpeed(s) {
    var m = s.match(/(\d{1,3})\s*(?:%|por ciento|porciento)/);
    if (m) {
      var pct = parseInt(m[1], 10);
      if (pct >= 0 && pct <= 100) return { value: pct, explicit: true };
    }
    for (var k in SPEED_WORDS) {
      if (containsAnyPhrase(s, SPEED_WORDS[k].words)) return { value: SPEED_WORDS[k].value, explicit: true };
    }
    return { value: 60, explicit: false };
  }

  // Numeros en letras -> cifras ("cinco segundos" -> "5 segundos",
  // "treinta y cinco por ciento" -> "35 por ciento"). Solo se usa para extraer
  // duracion, distancia y velocidad; las palabras de orden se buscan en el texto original.
  var NUM_WORDS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
    siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
    quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
    veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
    veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
    ochenta: 80, noventa: 90, cien: 100
  };
  function numbersToDigits(s) {
    var t = tokenize(s), out = [];
    for (var i = 0; i < t.length; i++) {
      var v = NUM_WORDS[t[i]];
      if (v === undefined) { out.push(t[i]); continue; }
      // "treinta y cinco": decena + y + unidad
      if (v >= 30 && v % 10 === 0 && v < 100 && t[i + 1] === 'y') {
        var u = NUM_WORDS[t[i + 2]];
        if (u !== undefined && u >= 1 && u <= 9) { v += u; i += 2; }
      }
      out.push(String(v));
    }
    return out.join(' ');
  }

  function extractDurationMs(s) {
    var m = s.match(/(?:por|durante)?\s*(\d{1,2})\s*(?:segundos|segundo|seg|s)\b/);
    if (m) {
      var sec = parseInt(m[1], 10);
      if (sec > 0) return Math.max(500, Math.min(sec * 1000, 15000));
    }
    return 0;
  }

  function extractStopCm(s) {
    var m = s.match(/(?:a|hasta)?\s*(\d{1,2})\s*(?:cm|centimetros|centimetro)\b/);
    if (m) {
      var cm = parseInt(m[1], 10);
      if (cm > 0) return Math.max(5, Math.min(cm, 30));   // rango del protocolo
    }
    return 10;
  }

  // Rumbo deseado por voz: "rumbo 90", "orientate a 270 grados", "rumbo norte",
  // "rumbo noventa". Devuelve grados en [0,360) o null si no es una orden de rumbo.
  var HEADING_KEYWORDS = /(^|\s)(rumbo|orientate|orientarse|orienta|apunta|apuntar|heading)(\s|$)/;
  var HEADING_WORDS = [
    // De mas largo a mas corto para que "ciento ochenta" no se lea como "ochenta".
    ['trescientos quince', 315], ['doscientos setenta', 270], ['doscientos veinticinco', 225],
    ['ciento ochenta', 180], ['ciento treinta y cinco', 135], ['cuarenta y cinco', 45],
    ['trescientos', 300], ['doscientos', 200], ['noventa', 90], ['sesenta', 60],
    ['treinta', 30], ['cien', 100], ['cero', 0],
    ['norte', 0], ['este', 90], ['oriente', 90], ['sur', 180], ['oeste', 270], ['occidente', 270]
  ];
  function extractHeading(s) {
    if (!HEADING_KEYWORDS.test(s)) return null;
    var m = s.match(/(\d{1,3}(?:\.\d+)?)/);
    if (m) {
      var deg = parseFloat(m[1]);
      return (deg >= 0 && deg < 360) ? deg : null;
    }
    for (var i = 0; i < HEADING_WORDS.length; i++) {
      if (containsPhrase(s, HEADING_WORDS[i][0])) return HEADING_WORDS[i][1];
    }
    return null;
  }

  // --- Submodos del modo autonomo -------------------------------------------
  // Grados dichos de cualquier forma: "90", "noventa", "ciento veinte", "norte".
  var CARDINALS = { norte: 0, noreste: 45, este: 90, oriente: 90, sureste: 135, sur: 180,
                    suroeste: 225, oeste: 270, occidente: 270, noroeste: 315 };
  var HUNDREDS = { ciento: 100, doscientos: 200, trescientos: 300 };
  function parseDegrees(s) {
    var m = s.match(/\d+/);
    var deg = m ? parseInt(m[0], 10) : null;
    if (deg === null) {
      var t = tokenize(numbersToDigits(s));
      for (var i = 0; i < t.length && deg === null; i++) {
        var isN = /^\d+$/.test(t[i]), next = t[i + 1] || '';
        if (HUNDREDS[t[i]] !== undefined) deg = HUNDREDS[t[i]] + (/^\d+$/.test(next) ? parseInt(next, 10) : 0);
        // "un rumbo de noventa": el articulo "un/una" no es un numero
        else if (isN && !(t[i] === '1' && next)) deg = parseInt(t[i], 10);
      }
      for (var j = 0; j < t.length && deg === null; j++) if (CARDINALS[t[j]] !== undefined) deg = CARDINALS[t[j]];
    }
    return deg !== null && deg >= 0 && deg < 360 ? deg : null;
  }

  // Submodo nombrado en el texto, o null. Linea > rumbo > esquivar.
  function strategyIn(s) {
    if (/\blineas?\b/.test(s)) return 'linea';
    if (/\b(rumbo|brujula)\b/.test(s)) return 'rumbo';
    if (/\b(esquiv|evad|evas|evit)/.test(s)) return 'evadir';
    return null;
  }

  function autoCommand(strategy, s) {
    // Sin strategy (o rumbo sin deg) la orden esta incompleta: la app pregunta.
    return Protocol.mode('autonomo', strategy, strategy === 'rumbo' ? parseDegrees(s) : null);
  }

  // "modo autonomo [siguiendo la linea]", "esquiva obstaculos", "sigue la linea",
  // "esquiva obstaculos con rumbo 90".
  function isAutoRequest(s) {
    return containsAnyPhrase(s, W.auto) || /\b(esquiv|evad|evit)/.test(s) ||
      (/\blineas?\b/.test(s) && /\b(sig[aou]|segu)/.test(s));
  }

  // Respuesta a "que submodo?" (pending='strategy') o "que rumbo?" ('heading').
  function autoReply(text, pending) {
    var s = normalize(text);
    if (!s || /\b(no|nunca)\b/.test(s) || containsAnyPhrase(s, W.stop) ||
        containsAnyPhrase(s, W.estop) || containsAnyPhrase(s, W.manual)) return null;
    var st = strategyIn(s);
    if (pending === 'heading' && (st === null || st === 'rumbo')) {
      return parseDegrees(s) === null ? null : markVoice(autoCommand('rumbo', s), text, s, {});
    }
    return st ? markVoice(autoCommand(st, s), text, s, {}) : null;
  }

  // Que falta para poder enviar un cmd de modo: 'strategy' | 'heading' | null.
  function missingFor(cmd) {
    if (!cmd || cmd.t !== 'mode' || cmd.value !== 'autonomo') return null;
    if (!cmd.strategy) return 'strategy';
    return cmd.strategy === 'rumbo' && cmd.deg === undefined ? 'heading' : null;
  }

  function isNegated(s) {
    return /(^|\s)(no|nunca|sin)\s+(avanza|avances|avance|avanzar|retrocede|retrocedas|retroceda|retroceder|gira|gires|gire|girar|para|pares|pare|parar|detente|detengas|detenga|detener|frena|frenes|frene|frenar|sigue|muevas|mover|vayas|ir)\b/.test(s);
  }

  function markVoice(cmd, raw, s, meta) {
    cmd._voice = {
      raw: raw || '',
      normalized: s || '',
      confidence: 'rule',
      until: meta && meta.until || null,
      stopCm: meta && meta.stopCm || null,
      maxMs: meta && meta.maxMs || null,
      speedSpecified: !!(meta && meta.speedSpecified)
    };
    return cmd;
  }

  function fromText(text) {
    var s = normalize(text);
    if (!s) return null;
    if (isNegated(s)) return null;

    var sn = numbersToDigits(s);   // "cinco segundos" -> "5 segundos"
    var speedInfo = extractSpeed(sn);
    var durationMs = extractDurationMs(sn);

    if (containsAnyPhrase(s, W.estop)) return markVoice(Protocol.estop(), text, s, {});
    if (containsAnyPhrase(s, W.stop)) return markVoice(Protocol.drive('stop', 0), text, s, {});

    if (isAutoRequest(s) && !containsAnyPhrase(s, W.manual)) {
      if (/\b(no|nunca)\b/.test(s)) return null;
      return markVoice(autoCommand(strategyIn(s), s), text, s, {});
    }

    var headingDeg = extractHeading(s);
    if (headingDeg !== null) return markVoice(Protocol.heading(headingDeg), text, s, {});

    var hasForward = containsAnyPhrase(s, W.forward);
    var hasBack = containsAnyPhrase(s, W.back);
    var hasLeft = containsAnyPhrase(s, W.left);
    var hasRight = containsAnyPhrase(s, W.right);
    var hasManual = containsAnyPhrase(s, W.manual);

    if (hasManual && !hasForward && !hasBack && !hasLeft && !hasRight) return markVoice(Protocol.mode('manual'), text, s, {});

    // Avanzar por voz SIEMPRE se detiene ante un obstaculo frontal (10 cm por
    // defecto, o lo que se diga: "avanza a 5 cm"). Sin duracion dicha, el tope
    // de seguridad es el maximo del protocolo (15 s).
    if (hasForward) {
      var stopCm = extractStopCm(sn);
      var maxMs = durationMs || Protocol.DRIVE_MAX_MS_MAX || 15000;
      var cmd = Protocol.drive('fwd', speedInfo.value, { until: 'front_obstacle', stop_cm: stopCm, max_ms: maxMs });
      return markVoice(cmd, text, s, { until: 'front_obstacle', stopCm: stopCm, maxMs: maxMs, speedSpecified: speedInfo.explicit });
    }

    if (hasBack) return markVoice(Protocol.drive('back', speedInfo.value), text, s, { maxMs: durationMs || null, speedSpecified: speedInfo.explicit });
    if (hasLeft) return markVoice(Protocol.drive('left', speedInfo.explicit ? speedInfo.value : 50), text, s, { maxMs: durationMs || null, speedSpecified: speedInfo.explicit });
    if (hasRight) return markVoice(Protocol.drive('right', speedInfo.explicit ? speedInfo.value : 50), text, s, { maxMs: durationMs || null, speedSpecified: speedInfo.explicit });

    return null;
  }

  // Descripcion legible de un comando (para historial/telemetria).
  function describe(cmd) {
    if (!cmd) return 'desconocido';
    switch (cmd.t) {
      case 'drive':
        var d = { fwd: 'avanzar', back: 'retroceder', left: 'girar a la izquierda',
                  right: 'girar a la derecha', stop: 'detener' }[cmd.dir] || cmd.dir;
        var extra = '';
        if (cmd.until === 'front_obstacle') extra += ' hasta obstáculo frontal <= ' + (cmd.stop_cm || 10) + ' cm';
        if (cmd.max_ms) extra += ' máx ' + (cmd.max_ms / 1000) + ' s';
        return 'mover: ' + d + ' (' + cmd.speed + '%)' + extra;
      case 'estop': return 'parada de emergencia';
      case 'mode':
        return 'modo ' + cmd.value + ({ evadir: ' (solo esquivar)', linea: ' (línea)',
          rumbo: ' (rumbo' + (cmd.deg !== undefined ? ' ' + Math.round(cmd.deg) + '°' : '') + ')' }[cmd.strategy] || '');
      case 'heading': return 'rumbo deseado ' + Math.round(cmd.deg) + '°';
      default: return cmd.t;
    }
  }

  return { normalize: normalize, numbersToDigits: numbersToDigits, fromText: fromText, autoReply: autoReply, missingFor: missingFor, describe: describe, WORDS: W };
});
