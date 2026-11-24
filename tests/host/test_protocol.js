#!/usr/bin/env node
/* Pruebas del protocolo v1 (app/shared/protocol.js). Sin red. */
'use strict';
const P = require('../../app/shared/protocol.js');

let fallos = 0;
function check(name, cond, detail) {
  console.log(`[${cond ? 'OK  ' : 'FALLA'}] ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) fallos++;
}

console.log('== Pruebas de protocolo v1 (RF-07) ==');

// Parseo valido
let r = P.parse('{"t":"hello","v":1}');
check('hello valido', r.ok && r.msg.t === 'hello');

r = P.parse('{"t":"drive","v":1,"dir":"fwd","speed":60}');
check('drive valido', r.ok);

// JSON invalido
r = P.parse('{no json}');
check('JSON invalido -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// Falta 't'
r = P.parse('{"v":1}');
check("falta 't' -> BAD_FORMAT", !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// Version
r = P.parse('{"t":"hello","v":2}');
check('version distinta -> VERSION_MISMATCH', !r.ok && r.error.code === P.ERROR.VERSION_MISMATCH);

// Tipo desconocido
r = P.parse('{"t":"volar","v":1}');
check('tipo desconocido -> UNKNOWN_CMD', !r.ok && r.error.code === P.ERROR.UNKNOWN_CMD);

// mode invalido
r = P.parse('{"t":"mode","v":1,"value":"turbo"}');
check('mode invalido -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// drive dir invalido
r = P.parse('{"t":"drive","v":1,"dir":"arriba"}');
check('drive.dir invalido -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// drive speed fuera de rango
r = P.parse('{"t":"drive","v":1,"dir":"fwd","speed":150}');
check('drive.speed>100 -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// heading fuera de rango
r = P.parse('{"t":"heading","v":1,"deg":360}');
check('heading.deg=360 -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// drive until front_obstacle (extensión v1 compatible)
r = P.parse('{"t":"drive","v":1,"dir":"fwd","speed":60,"ts":1,"until":"front_obstacle","stop_cm":10,"max_ms":8000}');
check('drive until front_obstacle ok', r.ok && r.msg.until === 'front_obstacle');
r = P.parse('{"t":"drive","v":1,"dir":"fwd","speed":60,"ts":1,"until":"wall"}');
check('drive until invalido -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);
r = P.parse('{"t":"drive","v":1,"dir":"fwd","speed":60,"ts":1,"stop_cm":10}');
check('drive stop_cm sin until -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);
r = P.parse('{"t":"drive","v":1,"dir":"left","speed":60,"ts":1,"until":"front_obstacle"}');
check('drive until solo fwd -> BAD_FORMAT', !r.ok && r.error.code === P.ERROR.BAD_FORMAT);

// round-trip
const drive = P.drive('left', 50);
r = P.parse(P.encode(drive));
check('round-trip encode/parse', r.ok && r.msg.dir === 'left' && r.msg.speed === 50);

// telemetria
const tel = P.telemetry({ mode: 'manual', conn: true });
check('telemetria lleva v y ts', tel.t === 'telemetry' && tel.v === 1 && typeof tel.ts === 'number');

// Direccion robot -> cliente (la app tambien debe validar lo que recibe)
let rr = P.parse(P.encode(P.helloAck()));
check('hello_ack valido en recepcion', rr.ok && rr.msg.t === 'hello_ack');
rr = P.parse(P.encode(P.ack('mode', 'manual')));
check('ack valido en recepcion', rr.ok && rr.msg.of === 'mode');
rr = P.parse(P.encode(tel));
check('telemetry valida en recepcion', rr.ok && rr.msg.t === 'telemetry');
rr = P.parse(P.encode(P.event('OBSTACLE_DETECTED', '34.2 cm')));
check('event valido en recepcion', rr.ok && rr.msg.code === 'OBSTACLE_DETECTED');
rr = P.parse(P.encode(P.error('BAD_FORMAT', 'x')));
check('error valido en recepcion', rr.ok && rr.msg.code === 'BAD_FORMAT');
rr = P.parse('{"t":"ack","v":1}');
check('ack sin of -> BAD_FORMAT', !rr.ok && rr.error.code === P.ERROR.BAD_FORMAT);
rr = P.parse('{"t":"event","v":1}');
check('event sin code -> BAD_FORMAT', !rr.ok && rr.error.code === P.ERROR.BAD_FORMAT);
check('validateRobot rechaza un comando', !P.validateRobot(P.hello()).ok);
check('validateClient rechaza telemetria', !P.validateClient(P.telemetry({})).ok);

// deadman
check('isFresh dentro de TTL', P.isFresh(1000, 1000 + 400, 500) === true);
check('isFresh fuera de TTL', P.isFresh(1000, 1000 + 600, 500) === false);
check('isFresh sin ts', P.isFresh(undefined, 0, 500) === false);

// ack/error builders
check('ack tiene v y of', P.ack('mode', 'manual').of === 'mode');
check('error tiene code', P.error('SAFETY').code === 'SAFETY');

console.log(fallos === 0 ? '\nRESULTADO: todas las comprobaciones pasaron'
                         : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
