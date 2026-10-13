/* ===========================================================================
 * jarvis.js - Asistente por reglas (RF-09), fase 1: coste 0, sin internet.
 * Responde desde una base de conocimiento (docs) + la TELEMETRIA real.
 * Regla dura: NO inventa mediciones. Si no hay dato, lo dice explicitamente.
 * UMD: window.Jarvis o module.exports.
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Jarvis = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalize(text) {
    if (!text) return '';
    var s = String(text).toLowerCase().trim();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[.,;:!?¡¿"]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function has(s, words) {
    for (var i = 0; i < words.length; i++) if (s.indexOf(words[i]) !== -1) return true;
    return false;
  }

  // Base de conocimiento (hechos del proyecto; sin mediciones).
  var KNOWLEDGE = {
    proyecto: 'El proyecto es un robot movil diferencial de 2 ruedas con una ' +
      'ESP32-S3. Integra control manual y por voz, navegacion autonoma, brujula ' +
      'digital, deteccion de colores, deteccion y evasion de obstaculos, ' +
      'telemetria inalambrica y este asistente.',
    hardware: 'Usa una ESP32-S3 N16R8, driver de motores TB6612FNG, brujula ' +
      'QMC5883L, sensor de color TCS34725, sensor ultrasonico HC-SR04 y motores ' +
      'TT con encoder. Se alimenta con un banco Li-ion 3S.',
    variables: {
      rumbo: 'grados (0-360) de orientacion respecto al norte magnetico.',
      color: 'color dominante detectado por el sensor RGB.',
      distancia: 'distancia en cm al obstaculo mas cercano (HC-SR04).',
      motores: 'porcentaje de potencia aplicado a cada motor (izq/der).',
      modo: 'MANUAL o AUTONOMO; son mutuamente excluyentes.',
      conexion: 'estado del enlace inalambrico con la app.'
    },
    comandos: ['"adelante"', '"atras"', '"izquierda"', '"derecha"', '"detente"',
      '"parada de emergencia"', '"modo manual"', '"modo autonomo"']
  };

  var INTENTS = {
    saludo: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey'],
    proyecto: ['que es', 'de que trata', 'que hace', 'proyecto', 'cuentame'],
    hardware: ['hardware', 'componentes', 'que usas', 'con que esta hecho', 'sensores tiene'],
    rumbo: ['rumbo', 'brujula', 'orientacion', 'direccion', 'norte', 'heading'],
    color: ['color', 'colores', 'que color'],
    distancia: ['distancia', 'obstaculo', 'que tan cerca', 'lejos', 'cuanto falta'],
    motores: ['motores', 'motor', 'velocidad', 'potencia'],
    modo: ['modo', 'manual', 'autonomo', 'automatico'],
    conexion: ['conexion', 'conectado', 'enlace', 'wifi', 'senal'],
    emergencia: ['emergencia', 'estop', 'parada'],
    ayuda: ['ayuda', 'comandos', 'que puedo decir', 'instrucciones'],
    gracias: ['gracias', 'muchas gracias'],
    identidad: ['quien eres', 'como te llamas', 'tu nombre', 'eres jarvis']
  };

  function classify(question) {
    var s = normalize(question);
    var order = ['identidad', 'saludo', 'proyecto', 'hardware', 'emergencia',
                 'rumbo', 'color', 'distancia', 'motores', 'modo', 'conexion',
                 'ayuda', 'gracias'];
    for (var i = 0; i < order.length; i++) {
      var intent = order[i];
      if (has(s, INTENTS[intent])) return intent;
    }
    return 'desconocido';
  }

  function fmt(n, dec) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    return n.toFixed(dec === undefined ? 1 : dec);
  }

  function answer(question, t) {
    var intent = classify(question);
    t = t || {};

    switch (intent) {
      case 'identidad':
        return 'Soy JARVIS, el asistente del robot. Explico el proyecto y las variables de telemetria.';
      case 'saludo':
        return 'Hola. Preguntame por el proyecto, el rumbo, el color, la distancia o el estado de los motores.';
      case 'proyecto':
        return KNOWLEDGE.proyecto;
      case 'hardware':
        return KNOWLEDGE.hardware;
      case 'rumbo':
        if (t.heading && t.heading.actual !== null && t.heading.actual !== undefined) {
          var a = fmt(t.heading.actual);
          var msg = 'El rumbo actual es ' + a + ' grados';
          if (t.heading.target !== null && t.heading.target !== undefined) {
            msg += ', deseado ' + fmt(t.heading.target) + ' grados';
          }
          if (t.heading.error !== null && t.heading.error !== undefined) {
            msg += ', error ' + fmt(t.heading.error) + ' grados';
          }
          return msg + '.';
        }
        return 'No tengo lectura de rumbo disponible (brujula sin datos o sin calibrar).';
      case 'color':
        if (t.color && t.color.valid && t.color.name) {
          return 'El color detectado es ' + t.color.name + '.';
        }
        return 'No tengo lectura de color valida en este momento.';
      case 'distancia':
        if (t.obstacle && t.obstacle.valid) {
          var cm = fmt(t.obstacle.distance_cm);
          var block = t.obstacle.blocked ? ' Hay un obstaculo en el camino.' : ' El camino esta libre.';
          return 'La distancia al obstaculo es ' + cm + ' cm.' + block;
        }
        return 'No tengo una lectura de distancia valida (fuera de rango o sin eco).';
      case 'motores':
        if (t.motors) {
          return 'Motores: izquierdo ' + (t.motors.left) + '%, derecho ' +
                 (t.motors.right) + '%, estado ' + (t.motors.state || 'desconocido') + '.';
        }
        return 'No tengo datos de los motores.';
      case 'modo':
        return t.mode ? ('El modo actual es ' + t.mode + '.') : 'No tengo el modo actual.';
      case 'conexion':
        return (t.conn === true) ? 'El robot esta conectado.' :
               (t.conn === false) ? 'El robot NO esta conectado.' :
               'No tengo informacion de la conexion.';
      case 'emergencia':
        return (t.estop === true) ? 'La parada de emergencia esta ACTIVA.' :
               (t.estop === false) ? 'La parada de emergencia esta inactiva.' :
               'Dime "parada de emergencia" para detener el robot de inmediato.';
      case 'ayuda':
        return 'Puedo explicar el proyecto y estas variables: rumbo, color, distancia, ' +
               'motores, modo y conexion. Comandos de voz: ' + KNOWLEDGE.comandos.join(', ') + '.';
      case 'gracias':
        return 'De nada.';
      default:
        return 'No estoy seguro de eso. Puedo hablar del proyecto o de las variables ' +
               '(rumbo, color, distancia, motores, modo, conexion). Di "ayuda" para mas.';
    }
  }

  return { classify: classify, answer: answer, KNOWLEDGE: KNOWLEDGE, INTENTS: INTENTS };
});
