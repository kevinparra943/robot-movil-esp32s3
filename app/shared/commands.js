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

  // Tablas de sinonimos (espanol + ingles).
  var W = {
    estop: ['parada de emergencia', 'emergencia', 'emergency', 'emergencia total', 'frenado de emergencia'],
    stop: ['detente', 'parar', 'para', 'alto', 'stop', 'frena', 'detenerse', 'quieto'],
    forward: ['adelante', 'avanza', 'avanzar', 'frente', 'forward', 'sigue', 'recto'],
    back: ['atras', 'retrocede', 'retroceder', 'reversa', 'back', 'reverse'],
    left: ['izquierda', 'left', 'gira a la izquierda', 'rota izquierda'],
    right: ['derecha', 'right', 'gira a la derecha', 'rota derecha'],
    manual: ['modo manual', 'manual', 'control manual'],
    auto: ['modo autonomo', 'autonomo', 'automatico', 'piloto automatico', 'automatic']
  };

  // Devuelve un comando del protocolo o null si no se reconoce.
  // El orden importa: "parada de emergencia" antes que "para".
  function fromText(text) {
    var s = normalize(text);
    if (!s) return null;

    if (containsAny(s, W.estop)) return Protocol.estop();
    if (containsAny(s, W.stop)) return Protocol.drive('stop', 0);
    if (containsAny(s, W.forward)) return Protocol.drive('fwd', 60);
    if (containsAny(s, W.back)) return Protocol.drive('back', 60);
    if (containsAny(s, W.left)) return Protocol.drive('left', 50);
    if (containsAny(s, W.right)) return Protocol.drive('right', 50);
    if (containsAny(s, W.manual)) return Protocol.mode('manual');
    if (containsAny(s, W.auto)) return Protocol.mode('autonomo');
    return null;
  }

  // Descripcion legible de un comando (para historial/telemetria).
  function describe(cmd) {
    if (!cmd) return 'desconocido';
    switch (cmd.t) {
      case 'drive':
        var d = { fwd: 'avanzar', back: 'retroceder', left: 'girar a la izquierda',
                  right: 'girar a la derecha', stop: 'detener' }[cmd.dir] || cmd.dir;
        return 'mover: ' + d + ' (' + cmd.speed + '%)';
      case 'estop': return 'parada de emergencia';
      case 'mode': return 'modo ' + cmd.value;
      default: return cmd.t;
    }
  }

  return { normalize: normalize, fromText: fromText, describe: describe, WORDS: W };
});
