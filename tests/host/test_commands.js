#!/usr/bin/env node
/* Pruebas del mapeo voz/texto -> comando (app/shared/commands.js). */
'use strict';
const C = require('../../app/shared/commands.js');
const P = require('../../app/shared/protocol.js');

let fallos = 0;
function check(name, cond, detail) {
  console.log(`[${cond ? 'OK  ' : 'FALLA'}] ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) fallos++;
}

console.log('== Pruebas de comandos de voz/texto (RF-02) ==');

const casos = [
  ['adelante', 'drive', 'fwd'],
  ['AVANZA por favor', 'drive', 'fwd'],
  ['atr\u00e1s', 'drive', 'back'],
  ['retrocede', 'drive', 'back'],
  ['gira a la izquierda', 'drive', 'left'],
  ['derecha', 'drive', 'right'],
  ['detente', 'drive', 'stop'],
  ['para', 'drive', 'stop'],
  ['alto', 'drive', 'stop'],
  ['modo manual', 'mode', 'manual'],
  ['pon modo aut\u00f3nomo', 'mode', 'autonomo'],
  ['parada de emergencia', 'estop', undefined]
];

function valorKey(t) { return t === 'drive' ? 'dir' : 'value'; }
for (const [texto, t, valor] of casos) {
  const cmd = C.fromText(texto);
  const ok = cmd && cmd.t === t && (valor === undefined || cmd[valorKey(t)] === valor || cmd.value === valor || cmd.dir === valor);
  check(`"${texto}" -> ${t}${valor ? ' ' + valor : ''}`, ok, cmd ? JSON.stringify(cmd) : '(null)');
}

let cmd = C.fromText('parada de emergencia');
check('emergencia tiene prioridad sobre para', cmd && cmd.t === 'estop');
check('texto no reconocido -> null', C.fromText('hola que tal') === null);
check('texto vacio -> null', C.fromText('') === null);
check('describe drive', C.describe(C.fromText('adelante')).indexOf('avanzar') !== -1);
check('normalize sin acentos', C.normalize('Aut\u00f3nomo') === 'autonomo');

// Sin?nimos / naturalidad
check('sigue recto', (cmd=C.fromText('sigue recto')) && cmd.t==='drive' && cmd.dir==='fwd');
check('ve hacia adelante', (cmd=C.fromText('ve hacia adelante')) && cmd.dir==='fwd');
check('frena', (cmd=C.fromText('frena')) && cmd.dir==='stop');
check('quieto', (cmd=C.fromText('quieto')) && cmd.dir==='stop');
check('vuelta a la derecha', (cmd=C.fromText('vuelta a la derecha')) && cmd.dir==='right');

// Velocidad por porcentaje y palabra
cmd = C.fromText('avanza al 30 por ciento');
check('velocidad 30%', cmd && cmd.dir==='fwd' && cmd.speed===30, JSON.stringify(cmd));
cmd = C.fromText('avanza despacio');
check('velocidad despacio', cmd && cmd.dir==='fwd' && cmd.speed===30, JSON.stringify(cmd));
cmd = C.fromText('retrocede r\u00e1pido');
check('velocidad rapido', cmd && cmd.dir==='back' && cmd.speed===85, JSON.stringify(cmd));

// Duraci?n
cmd = C.fromText('avanza 3 segundos');
check('duracion 3s', cmd && cmd.dir==='fwd' && cmd._voice && cmd._voice.maxMs===3000 && cmd.max_ms===3000, JSON.stringify(cmd));

// "avanza" por voz siempre se detiene ante un obstaculo frontal.
cmd = C.fromText('avanza');
check('avanza -> hasta obstaculo 10 cm, tope 15 s', cmd && cmd.until==='front_obstacle' && cmd.stop_cm===10 && cmd.max_ms===15000, JSON.stringify(cmd));
cmd = C.fromText('adelante a cinco centimetros');
check('avanza a cinco centimetros -> stop_cm 5', cmd && cmd.until==='front_obstacle' && cmd.stop_cm===5, JSON.stringify(cmd));
cmd = C.fromText('avanza a 2 cm');
check('stop_cm por debajo del minimo -> 5', cmd && cmd.stop_cm===5, JSON.stringify(cmd));
cmd = C.fromText('retrocede 2 segundos');
check('retrocede no usa until', cmd && cmd.dir==='back' && !cmd.until, JSON.stringify(cmd));

// Numeros en letras.
cmd = C.fromText('avanza cinco segundos');
check('cinco segundos -> 5000', cmd && cmd.max_ms===5000, JSON.stringify(cmd));
cmd = C.fromText('gira a la derecha dos segundos');
check('dos segundos -> 2000', cmd && cmd.dir==='right' && cmd._voice.maxMs===2000, JSON.stringify(cmd));
cmd = C.fromText('retrocede un segundo');
check('un segundo -> 1000', cmd && cmd.dir==='back' && cmd._voice.maxMs===1000, JSON.stringify(cmd));
cmd = C.fromText('avanza al treinta y cinco por ciento');
check('treinta y cinco por ciento -> 35', cmd && cmd.speed===35, JSON.stringify(cmd));
cmd = C.fromText('avanza hasta obstaculo a diez centimetros durante doce segundos');
check('diez cm + doce s', cmd && cmd.stop_cm===10 && cmd.max_ms===12000, JSON.stringify(cmd));
check('numbersToDigits', C.numbersToDigits('veinticinco y cuarenta y dos') === '25 y 42', C.numbersToDigits('veinticinco y cuarenta y dos'));

// Obst?culo frontal
cmd = C.fromText('avanza hasta un obst\u00e1culo de frente');
check('hasta obstaculo frontal', cmd && cmd.dir==='fwd' && cmd.until==='front_obstacle' && cmd.stop_cm===10, JSON.stringify(cmd));
check('max_ms default 15 s', cmd && cmd.max_ms===15000, JSON.stringify(cmd));
cmd = C.fromText('avanza hasta obst\u00e1culo de frente a 5 cm');
check('stop_cm 5', cmd && cmd.stop_cm===5, JSON.stringify(cmd));
cmd = C.fromText('avanza hasta obst\u00e1culo a 10 cm');
check('stop_cm 10', cmd && cmd.stop_cm===10, JSON.stringify(cmd));
cmd = C.fromText('avanza hasta obst\u00e1culo frontal al 40 por ciento');
check('obstaculo velocidad 40', cmd && cmd.speed===40 && cmd.until==='front_obstacle', JSON.stringify(cmd));

// Negaci?n / seguridad
check('no avanza -> null', C.fromText('no avanza') === null);
check('no te detengas -> null', C.fromText('no te detengas') === null);

// Rumbo deseado por voz
const rumbos = [
  ['rumbo 90', 90], ['Rumbo 270 grados', 270], ['oriéntate a 45 grados', 45],
  ['rumbo norte', 0], ['rumbo este', 90], ['rumbo sur', 180], ['rumbo oeste', 270],
  ['rumbo noventa', 90], ['rumbo ciento ochenta', 180], ['rumbo 0', 0]
];
for (const [frase, deg] of rumbos) {
  cmd = C.fromText(frase);
  check(`"${frase}" -> heading ${deg}`, cmd && cmd.t === 'heading' && cmd.deg === deg, JSON.stringify(cmd));
}
check('rumbo 400 -> no es rumbo', (C.fromText('rumbo 400') || {}).t !== 'heading');
check('heading por voz valido en protocolo', P.validateClient(C.fromText('rumbo 90')).ok);
check('describe heading', C.describe(C.fromText('rumbo 90')) === 'rumbo deseado 90°');
check('"gira a la derecha" sigue siendo drive', C.fromText('gira a la derecha').t === 'drive');

// Protocolo compatible (campos extra opcionales)
cmd = C.fromText('avanza hasta obst?culo de frente');
check('protocolo acepta until', P.validateClient(cmd).ok, JSON.stringify(P.validateClient(cmd)));

console.log(fallos === 0 ? '\nRESULTADO: todas las comprobaciones pasaron'
                         : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
