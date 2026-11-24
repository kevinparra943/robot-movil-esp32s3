#!/usr/bin/env node
/* Pruebas del asistente JARVIS por reglas (app/shared/jarvis.js). */
'use strict';
const J = require('../../app/shared/jarvis.js');

let fallos = 0;
function check(name, cond, detail) {
  console.log(`[${cond ? 'OK  ' : 'FALLA'}] ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) fallos++;
}

console.log('== Pruebas de JARVIS (RF-09) ==');

// Clasificacion de intenciones
const intents = [
  ['¿qué es el proyecto?', 'proyecto'],
  ['cuéntame del robot', 'proyecto'],
  ['qué rumbo tengo', 'rumbo'],
  ['de qué color es', 'color'],
  ['cuánto falta para el obstáculo', 'distancia'],
  ['cómo van los motores', 'motores'],
  ['en qué modo estás', 'modo'],
  ['estás conectado', 'conexion'],
  ['hay emergencia', 'emergencia'],
  ['ayuda', 'ayuda'],
  ['quién eres', 'identidad'],
  ['hola', 'saludo']
];
for (const [q, esperado] of intents) {
  check(`clasificar "${q}" -> ${esperado}`, J.classify(q) === esperado, '(=' + J.classify(q) + ')');
}

// Respuestas CON telemetria (no debe inventar: usa los datos)
const tel = {
  mode: 'autonomo', conn: true, estop: false,
  heading: { actual: 87.5, target: 90.0, error: -2.5 },
  color: { name: 'verde', rgb: [120, 200, 90], valid: true },
  obstacle: { distance_cm: 34.2, valid: true, blocked: false },
  motors: { left: 60, right: 60, state: 'moving' }
};
check('rumbo con datos menciona 87.5', J.answer('rumbo', tel).indexOf('87.5') !== -1);
check('color con datos menciona verde', J.answer('color', tel).indexOf('verde') !== -1);
check('distancia con datos menciona 34.2', J.answer('distancia', tel).indexOf('34.2') !== -1);
check('distancia libre no dice obstaculo', J.answer('distancia', tel).indexOf('obstaculo en el camino') === -1);
check('motores con datos', J.answer('motores', tel).indexOf('izquierdo 60') !== -1);
check('modo con datos', J.answer('modo', tel).indexOf('autonomo') !== -1);

// Respuestas SIN telemetria: debe reconocer que no hay dato, NO inventar.
const rHead = J.answer('rumbo', null);
check('rumbo sin datos admite no tenerlo', /no tengo/i.test(rHead));
check('rumbo sin datos NO inventa grados', !/\d+\s*grados/i.test(rHead));

const rCol = J.answer('color', {});
check('color sin datos admite no tenerlo', /no tengo/i.test(rCol));

const rObs = J.answer('distancia', {});
check('distancia sin datos admite no tenerlo', /no tengo/i.test(rObs));

// estop
check('estop activo', J.answer('emergencia', { estop: true }).indexOf('ACTIVA') !== -1);
check('estop inactivo', J.answer('emergencia', { estop: false }).indexOf('inactiva') !== -1);

// Desconocido
check('pregunta rara -> fallback', /no estoy seguro/i.test(J.answer('cuál es el sentido de la vida', tel)));

// Base tecnica: preguntas complejas -> tema correcto (texto con datos de Config.h)
const tecnicas = [
  ['¿cómo se alimenta el robot?', /3S/],
  ['explícame la parte eléctrica', /buck/i],
  ['¿para qué sirve el divisor de voltaje del ultrasonido?', /1 kΩ/],
  ['¿qué voltaje entrega el echo?', /3,3 V/],
  ['¿por qué el PWM es de 20 kHz?', /audible/],
  ['¿qué timers usa el robot?', /millis/],
  ['¿cómo funciona el deadman?', /500 ms/],
  ['¿por qué no usa pulseIn?', /bloquea/],
  ['¿cómo se comunica la app con el robot?', /WebSocket/],
  ['¿qué pasa si se cae el wifi?', /detiene solo/],
  ['¿qué es el bus I2C?', /GPIO 8/],
  ['¿cómo se lee la brújula?', /atan2/],
  ['¿cómo clasifica los colores?', /tono/],
  ['¿qué es el STBY?', /GPIO 18/],
  ['¿cómo se calcula el error angular?', /540/],
  ['¿cuál es la IP del robot?', /192\.168\.4\.1/],
  ['¿qué es una interrupción?', /CHANGE/]
];
for (const [q, re] of tecnicas) {
  const a = J.answer(q, {});
  check(`tecnica "${q}"`, re.test(a), re.test(a) ? '' : '-> ' + a.slice(0, 70));
}
// La telemetria en vivo sigue mandando cuando se pregunta por el valor actual
check('rumbo actual sigue leyendo telemetria', J.answer('¿cuál es el rumbo actual?', tel).indexOf('87.5') !== -1);
check('color en vivo', J.answer('¿qué color detectas?', tel).indexOf('verde') !== -1);
check('solo "Jarvis" saluda', /hola/i.test(J.answer('Jarvis', {})));

// Pregunta u orden (boton "Hablar")
const preguntas = ['¿qué es el PWM?', 'como funciona el modo autonomo', 'jarvis que es el proyecto',
  'que es la parada de emergencia', 'explicame los timers', 'hola jarvis', 'cada cuanto se envia la telemetria',
  'para que sirve el stby'];
for (const q of preguntas) check(`pregunta "${q}"`, J.isQuestion(q) === true);
const ordenes = ['avanza', 'detente', 'modo autonomo', 'parada de emergencia', 'gira a la derecha',
  'jarvis avanza', 'rumbo 90'];
for (const q of ordenes) check(`orden "${q}"`, J.isQuestion(q) === false);
check('stripWake quita "oye jarvis"', J.stripWake('oye Jarvis, avanza') === 'avanza');

// Submodos del modo autonomo
const C = require('../../app/shared/commands.js');
const P = require('../../app/shared/protocol.js');
for (const [txt, st, deg] of [
  ['modo autónomo', undefined, undefined], ['modo autónomo siguiendo la línea', 'linea', undefined],
  ['sigue la línea', 'linea', undefined], ['esquiva obstáculos', 'evadir', undefined],
  ['modo autónomo rumbo 90', 'rumbo', 90], ['esquivar obstáculos con un rumbo de ciento veinte', 'rumbo', 120],
  ['modo autónomo rumbo norte', 'rumbo', 0], ['modo autónomo siguiendo un rumbo', 'rumbo', undefined]]) {
  const c = C.fromText(txt);
  check(`auto "${txt}"`, c && c.t === 'mode' && c.value === 'autonomo' && c.strategy === st && c.deg === deg, JSON.stringify(c));
  check('  protocolo rechaza sin submodo', P.validateClient(c).ok === !!st);
}
check('falta submodo', C.missingFor(C.fromText('modo autonomo')) === 'strategy');
check('falta rumbo', C.missingFor(C.fromText('modo autonomo por rumbo')) === 'heading');
check('respuesta "solo esquivar"', C.autoReply('solo esquivar', 'strategy').strategy === 'evadir');
check('respuesta "noventa"', C.autoReply('noventa', 'heading').deg === 90);
check('respuesta "detente" no arranca', C.autoReply('detente', 'strategy') === null);
check('"no sigas la linea" no arranca', C.fromText('no sigas la linea') === null);
check('"detente" manda sobre la linea', C.fromText('detente en la linea').dir === 'stop');
check('"sigue recto" sigue siendo avanzar', C.fromText('sigue recto').dir === 'fwd');
check('"rumbo 90" a secas solo fija el rumbo', C.fromText('rumbo 90').t === 'heading');
check('deg fuera de rumbo se rechaza', !P.validateClient(P.mode('autonomo', 'linea', 90)).ok);
for (const q of ['ayuda, detente', 'hola jarvis para', 'hay que parar']) check(`parada "${q}"`, !J.isQuestion(q));

// Confirmaciones y texto hablado
check('confirm estop', /emergencia/i.test(J.confirm({ t: 'estop' })));
check('confirm heading', J.confirm({ t: 'heading', deg: 90 }).indexOf('90 grados') !== -1);
const sp = J.toSpeech('Divisor de 1 kΩ a 3,3 V, 20 kHz, 30 ms, 0x29, GPIO 8, 50 %.');
check('toSpeech unidades', /kiloohmios/.test(sp) && /voltios/.test(sp) && /kilohercios/.test(sp) &&
  /milisegundos/.test(sp) && /por ciento/.test(sp) && !/kΩ|%/.test(sp), '-> ' + sp);

console.log(fallos === 0 ? '\nRESULTADO: todas las comprobaciones pasaron'
                         : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
