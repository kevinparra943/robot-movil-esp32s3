/* ===========================================================================
 * jarvis.js - Asistente por reglas (RF-09), fase 1: coste 0, sin internet.
 * Responde desde:
 *   - la base de conocimiento tecnica (jarvis_kb.js): circuito, alimentacion,
 *     pines, I2C, PWM, timers, interrupciones, sensores, WiFi, protocolo...
 *   - la TELEMETRIA real (rumbo, color, distancias, motores, modo...).
 * Regla dura: NO inventa mediciones. Si no hay dato, lo dice explicitamente.
 * Tambien decide si una frase es PREGUNTA (para JARVIS) u ORDEN (para el
 * robot) y prepara el texto para leerlo en voz alta.
 * UMD: window.Jarvis o module.exports. En el navegador cargar antes
 * jarvis_kb.js (window.JarvisKB).
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./jarvis_kb.js'));
  else root.Jarvis = factory(root.JarvisKB);
})(typeof self !== 'undefined' ? self : this, function (KB) {
  'use strict';

  KB = KB || { topics: [] };

  function normalize(text) {
    if (!text) return '';
    var s = String(text).toLowerCase().trim();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[.,;:!?¡¿"()]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function has(s, words) {
    for (var i = 0; i < words.length; i++) if (s.indexOf(words[i]) !== -1) return true;
    return false;
  }

  // Base de conocimiento general (hechos del proyecto; sin mediciones).
  var KNOWLEDGE = {
    proyecto: 'El proyecto es un robot movil diferencial de 2 ruedas con una ' +
      'ESP32-S3. Integra control manual y por voz, navegacion autonoma, brujula ' +
      'digital, deteccion de colores, deteccion y evasion de obstaculos, ' +
      'telemetria inalambrica y este asistente.',
    hardware: 'Usa una ESP32-S3 N16R8, driver de motores TB6612FNG, brujula ' +
      'QMC5883L, sensor de color TCS34725, tres sensores ultrasonicos HC-SR04 y motores ' +
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
      '"parada de emergencia"', '"modo manual"', '"modo autonomo"', '"rumbo 90"']
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
    ayuda: ['ayuda', 'comandos', 'que puedo decir', 'instrucciones', 'que sabes'],
    gracias: ['gracias', 'muchas gracias'],
    identidad: ['quien eres', 'como te llamas', 'tu nombre', 'eres jarvis']
  };

  // Intenciones que leen telemetria en vivo.
  var LIVE_INTENTS = ['rumbo', 'color', 'distancia', 'motores', 'modo', 'conexion', 'emergencia'];
  // Marcas de que se pregunta por el valor ACTUAL, no por el funcionamiento.
  var LIVE_MARKERS = ['actual', 'ahora', 'en este momento', 'tengo', 'marca', 'esta midiendo',
    'estas', 'esta el robot', 'cuanto mide', 'que lee', 'que detecta ahora'];
  // Marcas de pregunta tecnica (funcionamiento, conexion, diseno).
  var TECH_MARKERS = ['como funciona', 'como se', 'como lee', 'como mide', 'como calcula',
    'como esta conectad', 'como conect', 'como detecta', 'como controla', 'como sabe',
    'como distingue', 'como evita', 'como se comunica', 'por que', 'porque', 'para que',
    'que es', 'que son', 'explica', 'explicame', 'describe', 'funciona', 'conect', 'pin',
    'gpio', 'circuito', 'calibr', 'registro', 'formula', 'principio', 'diferencia',
    'cada cuanto', 'cuantos', 'donde va', 'a que', 'hablame', 'cuentame sobre', 'detalle',
    'que pasa si', 'que pasaria', 'sirve', 'conexiones', 'cuales son'];

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

  // --- Busqueda en la base tecnica ----------------------------------------
  // Una clave de >= 5 letras coincide como prefijo de palabra ("conect" ->
  // "conectado"); las cortas ("pin", "ip", "bus") solo como palabra entera.
  // Peso = numero de palabras de la clave (las frases son mas especificas).
  // Si una clave esta contenida en otra que tambien coincide ("motor" en
  // "motores"), solo cuenta la mas larga: variantes de una palabra no suman.
  function keyScore(padded, keys) {
    var hits = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var hit = k.length >= 5 ? padded.indexOf(' ' + k) !== -1
                              : padded.indexOf(' ' + k + ' ') !== -1;
      if (hit) hits.push(k);
    }
    var score = 0;
    for (var a = 0; a < hits.length; a++) {
      var covered = false;
      for (var b = 0; b < hits.length; b++) {
        if (a !== b && hits[b].length > hits[a].length && hits[b].indexOf(hits[a]) !== -1) { covered = true; break; }
      }
      if (!covered) score += hits[a].split(' ').length;
    }
    return score;
  }

  function searchKB(question) {
    var padded = ' ' + normalize(question) + ' ';
    var best = null;
    var topics = KB.topics || [];
    for (var i = 0; i < topics.length; i++) {
      var tp = topics[i];
      var base = keyScore(padded, tp.keys || []);
      var facts = tp.facts || [];
      var bestFact = null, bestFactScore = 0;
      for (var j = 0; j < facts.length; j++) {
        var fs = keyScore(padded, facts[j].keys || []);
        if (fs > bestFactScore) { bestFactScore = fs; bestFact = facts[j]; }
      }
      // Un dato concreto solo cuenta si el tema tambien se nombra, o si la
      // coincidencia del dato es fuerte por si sola (frase de 2+ palabras).
      var total = base + (base > 0 || bestFactScore >= 2 ? bestFactScore * 2 : 0);
      if (total > 0 && (!best || total > best.score)) {
        best = {
          id: tp.id,
          score: total,
          text: (bestFact && (base > 0 || bestFactScore >= 2)) ? bestFact.text : tp.text
        };
      }
    }
    return best;
  }

  function fmt(n, dec) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    return n.toFixed(dec === undefined ? 1 : dec);
  }

  function liveAnswer(intent, t) {
    switch (intent) {
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
          var side = [];
          if (t.obstacle_left && t.obstacle_left.valid) side.push('izquierda ' + fmt(t.obstacle_left.distance_cm) + ' cm');
          if (t.obstacle_right && t.obstacle_right.valid) side.push('derecha ' + fmt(t.obstacle_right.distance_cm) + ' cm');
          return 'La distancia al obstaculo es ' + cm + ' cm.' + block +
                 (side.length ? ' Laterales: ' + side.join(', ') + '.' : '');
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
    }
    return null;
  }

  function answer(question, t) {
    t = t || {};
    // "Jarvis" / "hola Jarvis" a secas: saludo. Si no, se quita el nombre.
    var onlyName = !!normalize(question) && !stripWake(question);
    question = stripWake(question) || question;
    var intent = onlyName ? 'saludo' : classify(question);
    var s = normalize(question);

    var isLive = LIVE_INTENTS.indexOf(intent) !== -1;
    var asksLive = isLive && has(s, LIVE_MARKERS);
    var kb = (asksLive || onlyName) ? null : searchKB(question);
    // La base tecnica gana si la pregunta es de funcionamiento/diseno, si no
    // encaja en ninguna intencion simple o si nombra varios conceptos tecnicos.
    if (kb && (has(s, TECH_MARKERS) || intent === 'desconocido' || kb.score >= 2)) {
      return kb.text;
    }

    if (isLive) return liveAnswer(intent, t);

    switch (intent) {
      case 'identidad':
        return 'Soy JARVIS, el asistente del robot. Explico el proyecto, su circuito, ' +
               'sus sensores y su comunicacion, y leo la telemetria en tiempo real.';
      case 'saludo':
        return 'Hola. Preguntame por el proyecto, el circuito, los sensores, el rumbo, ' +
               'el color, la distancia o los motores, o dame una orden para el robot.';
      case 'proyecto':
        return KNOWLEDGE.proyecto;
      case 'hardware':
        return KNOWLEDGE.hardware;
      case 'ayuda':
        return 'Puedo explicar el proyecto y su parte tecnica: alimentacion y bateria, ' +
               'conexiones y pines, driver y PWM de los motores, timers e interrupciones, ' +
               'bus I2C, brujula, sensor de color, ultrasonidos, encoders, WiFi, protocolo ' +
               'WebSocket, seguridad, maquina de estados y navegacion autonoma. Tambien leo ' +
               'las variables en vivo. Ordenes de voz: ' + KNOWLEDGE.comandos.join(', ') + '.';
      case 'gracias':
        return 'De nada.';
      default:
        return 'No estoy seguro de eso. Puedo explicar el circuito, los pines, la ' +
               'comunicacion, los timers o los sensores, y leer las variables en vivo ' +
               '(rumbo, color, distancia, motores, modo, conexion). Di "ayuda" para mas.';
    }
  }

  // --- Pregunta u orden ----------------------------------------------------
  var WAKE = /^(?:(?:oye|hey|hola|ok|okay)\s+)?jarvis\s*/;
  function stripWake(text) {
    return normalize(text).replace(WAKE, '').trim();
  }

  var QUESTION_START = ['que', 'como', 'cual', 'cuales', 'cuanto', 'cuanta', 'cuantos',
    'cuantas', 'donde', 'cuando', 'por que', 'porque', 'para que', 'quien', 'quienes',
    'explica', 'explicame', 'explicanos', 'dime', 'cuentame', 'hablame', 'describe',
    'describeme', 'sabes', 'me explicas', 'me dices', 'puedes explicar', 'podrias',
    'hay', 'es', 'esta', 'estas', 'tiene', 'tienes', 'ayuda', 'hola', 'gracias',
    'muchas gracias', 'buenos dias', 'buenas tardes', 'buenas noches', 'estado',
    'cada cuanto', 'en que', 'con que', 'de que', 'a que', 'necesito saber', 'quiero saber'];

  // true si la frase es una pregunta/conversacion (va a JARVIS) y no una orden.
  // Ojo: "detente" o "parada de emergencia" dichas como orden NO son preguntas.
  // Arranques de cortesia/afirmacion: si van seguidos de una orden de parada
  // ("ayuda, detente", "hola jarvis para") manda la parada.
  var SOFT_START = /^(hola|gracias|muchas gracias|ayuda|hay|es|esta|estas|estado|buen[oa]s \w+|podrias|puedes)\b/;
  var STOP_WORDS = /\b(detente|detener|para|parar|parate|alto|stop|frena|frenar|quieto|emergencia)\b/;

  function isQuestion(text) {
    if (!text) return false;
    if (/[?¿]/.test(String(text))) return true;
    if (!normalize(text)) return false;
    var s = stripWake(text);
    if (SOFT_START.test(s) && STOP_WORDS.test(s)) return false;
    if (!s) return true;   // solo "Jarvis" / "hola Jarvis": saludo
    for (var i = 0; i < QUESTION_START.length; i++) {
      var w = QUESTION_START[i];
      if (s === w || s.indexOf(w + ' ') === 0) return true;
    }
    return false;
  }

  // Frase corta con la que JARVIS confirma una orden enviada al robot.
  function confirm(cmd) {
    if (!cmd) return 'No entendi la orden.';
    switch (cmd.t) {
      case 'estop': return 'Parada de emergencia activada.';
      case 'mode':
        if (cmd.value !== 'autonomo') return 'Modo manual activado.';
        return { evadir: 'Modo autónomo: solo esquivo obstáculos.',
                 linea: 'Modo autónomo: sigo la línea y esquivo obstáculos.',
                 rumbo: 'Modo autónomo: rumbo ' + Math.round(cmd.deg) + ' grados, esquivando obstáculos.'
               }[cmd.strategy] || 'Modo autónomo activado.';
      case 'heading': return 'Rumbo deseado fijado en ' + Math.round(cmd.deg) + ' grados.';
      case 'drive':
        if (cmd.dir === 'stop') return 'Detenido.';
        if (cmd.until === 'front_obstacle') {
          return 'Avanzando hasta encontrar un obstaculo a ' + (cmd.stop_cm || 10) + ' centimetros.';
        }
        return { fwd: 'Avanzando.', back: 'Retrocediendo.', left: 'Girando a la izquierda.',
                 right: 'Girando a la derecha.' }[cmd.dir] || 'Orden enviada.';
    }
    return 'Orden enviada.';
  }

  // Lo que JARVIS pregunta cuando falta el submodo o el rumbo.
  function askAuto(missing) {
    return missing === 'heading'
      ? '¿Qué rumbo quieres, en grados, o norte, sur, este u oeste?'
      : '¿Qué modo autónomo quieres: solo esquivar, seguir un rumbo o seguir la línea?';
  }

  // Texto adaptado para la sintesis de voz (unidades y siglas legibles).
  function toSpeech(text) {
    var s = String(text || '');
    var rules = [
      [/(\d)\s*°/g, '$1 grados'], [/°/g, ' grados'],
      [/(\d)\s*%/g, '$1 por ciento'],
      [/(\d)\s*µs\b/g, '$1 microsegundos'], [/(\d)\s*us\b/g, '$1 microsegundos'],
      [/(\d)\s*ms\b/g, '$1 milisegundos'],
      [/(\d)\s*kHz\b/g, '$1 kilohercios'], [/(\d)\s*MHz\b/g, '$1 megahercios'], [/(\d)\s*GHz\b/g, '$1 gigahercios'],
      [/(\d)\s*Hz\b/g, '$1 hercios'],
      [/(\d)\s*µF\b/g, '$1 microfaradios'], [/(\d)\s*nF\b/g, '$1 nanofaradios'],
      [/(\d)\s*kΩ/g, '$1 kiloohmios'], [/(\d)\s*Ω/g, '$1 ohmios'],
      [/(\d)\s*cm\b/g, '$1 centímetros'], [/(\d)\s*mA\b/g, '$1 miliamperios'],
      [/(\d)\s*MB\b/g, '$1 megabytes'], [/(\d)\s*V\b/g, '$1 voltios'], [/(\d)\s*s\b/g, '$1 segundos'],
      [/0x([0-9A-Fa-f]+)/g, function (_m, h) { return 'cero equis ' + h.split('').join(' '); }],
      [/I²C|I2C/g, 'I dos C'], [/\bGPIO\b/g, 'G P I O'], [/\bPWM\b/g, 'P W M'],
      [/\bJSON\b/g, 'yeison'], [/\bWiFi\b/gi, 'wifi'], [/ws:\/\//g, ''],
      [/->|→/g, ' a '], [/["_]/g, ' ']
    ];
    for (var i = 0; i < rules.length; i++) s = s.replace(rules[i][0], rules[i][1]);
    return s.replace(/\s+/g, ' ').trim();
  }

  return {
    classify: classify, answer: answer, searchKB: searchKB, isQuestion: isQuestion,
    stripWake: stripWake, confirm: confirm, askAuto: askAuto, toSpeech: toSpeech,
    KNOWLEDGE: KNOWLEDGE, INTENTS: INTENTS, KB: KB
  };
});
