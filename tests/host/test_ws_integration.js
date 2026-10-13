#!/usr/bin/env node
/* Prueba de integracion extremo a extremo: cliente WS <-> robot simulado. */
'use strict';
const { startMockRobot } = require('./mock_robot_server.js');
const P = require('../../app/shared/protocol.js');

const WS = globalThis.WebSocket;
let fallos = 0;
function check(name, cond, detail) {
  console.log(`[${cond ? 'OK  ' : 'FALLA'}] ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) fallos++;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    const inbox = [];
    const waiters = [];
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      const i = waiters.findIndex((w) => w.pred(m));
      if (i >= 0) { const w = waiters.splice(i, 1)[0]; w.resolve(m); }
      else inbox.push(m);
    };
    ws.onopen = () => {
      resolve({
        ws,
        send: (obj) => ws.send(P.encode(obj)),
        waitFor: (pred, timeoutMs) => {
          const j = inbox.findIndex(pred);
          if (j >= 0) return Promise.resolve(inbox.splice(j, 1)[0]);
          return new Promise((res, rej) => {
            const w = { pred, resolve: res };
            waiters.push(w);
            setTimeout(() => {
              const idx = waiters.indexOf(w);
              if (idx >= 0) { waiters.splice(idx, 1); rej(new Error('timeout')); }
            }, timeoutMs || 3000);
          });
        },
        close: () => ws.close()
      });
    };
    ws.onerror = reject;
  });
}

async function main() {
  console.log('== Prueba de integracion WS (RF-07) ==');
  const robot = await startMockRobot();
  const url = `ws://127.0.0.1:${robot.port}`;
  const c = await connect(url);
  check('conexion WebSocket establecida', true);

  // Handshake
  c.send(P.hello());
  let m = await c.waitFor((x) => x.t === 'hello_ack');
  check('hello -> hello_ack', !!m);

  // ping/pong
  c.send(P.ping());
  m = await c.waitFor((x) => x.t === 'pong');
  check('ping -> pong', !!m);

  // modo
  c.send(P.mode('manual'));
  m = await c.waitFor((x) => x.t === 'ack' && x.of === 'mode');
  check('mode -> ack(manual)', m.value === 'manual');

  // drive + deadman
  c.send(P.drive('fwd', 70));
  m = await c.waitFor((x) => x.t === 'ack' && x.of === 'drive');
  check('drive -> ack', m.value === 'fwd');
  m = await c.waitFor((x) => x.t === 'telemetry' && x.motors && x.motors.state === 'moving', 1500);
  check('drive mueve los motores', !!m);
  // No refrescamos: debe detenerse por deadman.
  m = await c.waitFor((x) => x.t === 'telemetry' && x.motors && x.motors.state === 'stopped', 2500);
  check('deadman detiene tras el TTL', !!m);

  // telemetria con estructura esperada
  c.send({ t: 'status', v: 1 });
  const t = await c.waitFor((x) => x.t === 'telemetry');
  check('telemetria v=1', t.v === 1);
  check('telemetria trae rumbo/color/obstaculo',
    t.heading && t.color && t.obstacle);

  // estop: ack + event, y rechazo por SAFETY de comandos de movimiento
  c.send(P.estop());
  m = await c.waitFor((x) => x.t === 'ack' && x.of === 'estop');
  check('estop -> ack', !!m);
  m = await c.waitFor((x) => x.t === 'event' && x.code === 'ESTOP');
  check('estop -> event ESTOP', !!m);
  c.send(P.drive('fwd', 50));
  m = await c.waitFor((x) => x.t === 'error' && x.code === P.ERROR.SAFETY);
  check('tras estop, drive -> error SAFETY', !!m);

  c.close();
  await robot.close();

  console.log(fallos === 0 ? '\nRESULTADO: todas las comprobaciones pasaron'
                           : `\nRESULTADO: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
