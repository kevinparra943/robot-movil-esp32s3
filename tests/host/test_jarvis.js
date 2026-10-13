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

console.log(fallos === 0 ? '\nRESULTADO: todas las comprobaciones pasaron'
                         : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
