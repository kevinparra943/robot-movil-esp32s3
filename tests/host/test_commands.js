#!/usr/bin/env node
/* Pruebas del mapeo voz/texto -> comando (app/shared/commands.js). */
'use strict';
const C = require('../../app/shared/commands.js');

let fallos = 0;
function check(name, cond, detail) {
  console.log(`[${cond ? 'OK  ' : 'FALLA'}] ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) fallos++;
}

console.log('== Pruebas de comandos de voz/texto (RF-02) ==');

const casos = [
  ['adelante', 'drive', 'fwd'],
  ['AVANZA por favor', 'drive', 'fwd'],
  ['atrás', 'drive', 'back'],
  ['retrocede', 'drive', 'back'],
  ['gira a la izquierda', 'drive', 'left'],
  ['derecha', 'drive', 'right'],
  ['detente', 'drive', 'stop'],
  ['para', 'drive', 'stop'],
  ['alto', 'drive', 'stop'],
  ['modo manual', 'mode', 'manual'],
  ['pon modo autónomo', 'mode', 'autonomo'],
  ['parada de emergencia', 'estop', undefined]
];

for (const [texto, t, valor] of casos) {
  const cmd = C.fromText(texto);
  const ok = cmd && cmd.t === t && (valor === undefined || cmd[valorKey(t)] === valor || cmd.value === valor || cmd.dir === valor);
  check(`"${texto}" -> ${t}${valor ? ' ' + valor : ''}`, ok, cmd ? JSON.stringify(cmd) : '(null)');
}

function valorKey(t) { return t === 'drive' ? 'dir' : 'value'; }

// Orden: "parada de emergencia" gana a "para"
let cmd = C.fromText('parada de emergencia');
check('emergencia tiene prioridad sobre para', cmd && cmd.t === 'estop');

// No reconocido
check('texto no reconocido -> null', C.fromText('hola que tal') === null);
check('texto vacio -> null', C.fromText('') === null);

// describe
check('describe drive', C.describe(C.fromText('adelante')).indexOf('avanzar') !== -1);

// normalize quita acentos
check('normalize sin acentos', C.normalize('Autónomo') === 'autonomo');

console.log(fallos === 0 ? '\nRESULTADO: todas las comprobaciones pasaron'
                         : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
