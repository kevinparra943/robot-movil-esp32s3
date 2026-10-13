/* ===========================================================================
 * mock_robot_server.js - ESP32-S3 SIMULADO para pruebas (sin hardware).
 *
 * Servidor WebSocket minimo, SIN dependencias externas (solo Node). Implementa
 * el protocolo v1 de docs/protocolo_comunicacion.md lo suficiente para probar
 * la app: handshake, ping/pong, mode, drive (con deadman), estop, telemetria.
 *
 * Uso programatico:
 *   const { startMockRobot } = require('./mock_robot_server.js');
 *   const robot = await startMockRobot();          // puerto efimero
 *   ... robot.port ...
 *   await robot.close();
 * =========================================================================== */
'use strict';

const http = require('http');
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PROTOCOL_VERSION = 1;
const COMMAND_TTL_MS = 500;
const TELEMETRY_PERIOD_MS = 200;

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

// --- Framing WebSocket (suficiente para mensajes de texto pequenos) --------
function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer) {
  // Devuelve {frames:[str], rest:Buffer}. Solo soporta texto/close/ping.
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = offset + 2;
    if (len === 126) {
      if (buffer.length - p < 2) break;
      len = buffer.readUInt16BE(p); p += 2;
    } else if (len === 127) {
      if (buffer.length - p < 8) break;
      len = Number(buffer.readBigUInt64BE(p)); p += 8;
    }
    let mask = null;
    if (masked) {
      if (buffer.length - p < 4) break;
      mask = buffer.slice(p, p + 4); p += 4;
    }
    if (buffer.length - p < len) break;
    const data = buffer.slice(p, p + len);
    offset = p + len;
    if (opcode === 0x8) { // close
      frames.push({ opcode: 'close' });
      continue;
    }
    let text = data;
    if (masked) {
      text = Buffer.alloc(len);
      for (let i = 0; i < len; i++) text[i] = data[i] ^ mask[i % 4];
    }
    frames.push({ opcode: opcode, text: text.toString('utf8') });
  }
  return { frames, rest: buffer.slice(offset) };
}

class MockRobot {
  constructor(server) {
    this.server = server;
    this.clients = new Set();
    this.mode = 'idle';
    this.estop = false;
    this.motors = { left: 0, right: 0, state: 'stopped' };
    this.heading = { actual: 87.5, target: 90.0, error: -2.5 };
    this.color = { name: 'verde', rgb: [120, 200, 90], valid: true };
    this.obstacle = { distance_cm: 34.2, valid: true, blocked: false };
    this._lastDrive = 0;
    this._driveDir = 'stop';
    this._timer = setInterval(() => this._tick(), 50);
  }

  _tick() {
    // Deadman: si el ultimo drive caduco, detener.
    if (this._driveDir !== 'stop' && Date.now() - this._lastDrive > COMMAND_TTL_MS) {
      this._applyDrive('stop', 0);
    }
    // Telemetria periodica.
    this._telemetryCounter = (this._telemetryCounter || 0) + 1;
    if (this._telemetryCounter * 50 >= TELEMETRY_PERIOD_MS) {
      this._telemetryCounter = 0;
      this.broadcast(this.telemetry());
    }
  }

  _applyDrive(dir, speed) {
    this._driveDir = dir;
    if (dir === 'stop') {
      this.motors = { left: 0, right: 0, state: 'stopped' };
    } else {
      const s = (dir === 'left' || dir === 'right') ? speed * 0.5 : speed;
      const left = (dir === 'fwd') ? speed : (dir === 'back') ? -speed : (dir === 'left') ? -s : s;
      const right = (dir === 'fwd') ? speed : (dir === 'back') ? -speed : (dir === 'left') ? s : -s;
      this.motors = { left: left, right: right, state: 'moving' };
    }
  }

  telemetry() {
    return {
      t: 'telemetry', v: PROTOCOL_VERSION, ts: Date.now(),
      mode: this.mode,
      conn: true,
      heading: this.heading,
      color: this.color,
      obstacle: this.obstacle,
      motors: this.motors,
      nav: { state: 'IDLE', level: 1 },
      estop: this.estop
    };
  }

  handleText(client, raw) {
    let msg;
    try { msg = JSON.parse(raw); }
    catch (e) { return client.send(JSON.stringify({ t: 'error', v: 1, code: 'BAD_FORMAT', detail: 'JSON invalido' })); }

    if (typeof msg !== 'object' || !msg.t) {
      return client.send(JSON.stringify({ t: 'error', v: 1, code: 'BAD_FORMAT', detail: "falta 't'" }));
    }
    if (msg.v !== PROTOCOL_VERSION) {
      return client.send(JSON.stringify({ t: 'error', v: 1, code: 'VERSION_MISMATCH', detail: 'v=' + msg.v }));
    }
    // Seguridad: con estop activo solo se aceptan estop/ping/status/hello.
    if (this.estop && ['drive', 'mode', 'heading', 'calib'].indexOf(msg.t) !== -1) {
      return client.send(JSON.stringify({ t: 'error', v: 1, code: 'SAFETY', detail: 'estop activo' }));
    }

    switch (msg.t) {
      case 'hello':
        client.send(JSON.stringify({ t: 'hello_ack', v: PROTOCOL_VERSION }));
        break;
      case 'ping':
        client.send(JSON.stringify({ t: 'pong', v: PROTOCOL_VERSION }));
        break;
      case 'status':
        client.send(JSON.stringify(this.telemetry()));
        break;
      case 'mode':
        if (['manual', 'autonomo'].indexOf(msg.value) === -1) {
          return client.send(JSON.stringify({ t: 'error', v: 1, code: 'BAD_FORMAT', detail: 'mode.value' }));
        }
        this.mode = msg.value;
        client.send(JSON.stringify({ t: 'ack', v: 1, of: 'mode', value: msg.value }));
        break;
      case 'drive':
        if (['fwd', 'back', 'left', 'right', 'stop'].indexOf(msg.dir) === -1) {
          return client.send(JSON.stringify({ t: 'error', v: 1, code: 'BAD_FORMAT', detail: 'drive.dir' }));
        }
        this._lastDrive = Date.now();
        this._applyDrive(msg.dir, typeof msg.speed === 'number' ? msg.speed : 60);
        client.send(JSON.stringify({ t: 'ack', v: 1, of: 'drive', value: msg.dir }));
        break;
      case 'heading':
        this.heading.target = msg.deg;
        this.heading.error = ((msg.deg - this.heading.actual + 540) % 360) - 180;
        client.send(JSON.stringify({ t: 'ack', v: 1, of: 'heading', value: msg.deg }));
        break;
      case 'estop':
        this.estop = true;
        this._applyDrive('stop', 0);
        client.send(JSON.stringify({ t: 'ack', v: 1, of: 'estop' }));
        client.send(JSON.stringify({ t: 'event', v: 1, ts: Date.now(), code: 'ESTOP', detail: 'parada de emergencia' }));
        break;
      case 'calib':
        client.send(JSON.stringify({ t: 'ack', v: 1, of: 'calib', value: msg.what + ':' + msg.action }));
        break;
      default:
        client.send(JSON.stringify({ t: 'error', v: 1, code: 'UNKNOWN_CMD', detail: msg.t }));
    }
  }

  broadcast(obj) {
    const data = encodeFrame(JSON.stringify(obj));
    for (const c of this.clients) c.socket.write(data);
  }

  addClient(client) {
    this.clients.add(client);
  }
  removeClient(client) {
    this.clients.delete(client);
  }

  close() {
    clearInterval(this._timer);
    for (const c of this.clients) { try { c.socket.destroy(); } catch (e) {} }
    return new Promise((res) => this.server.close(res));
  }
}

function startMockRobot(opts) {
  opts = opts || {};
  const server = http.createServer((req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('Se requiere WebSocket');
  });

  const robot = new MockRobot(server);

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
    );
    const client = { socket, buffer: Buffer.alloc(0), send: (s) => socket.write(encodeFrame(s)) };
    robot.addClient(client);

    socket.on('data', (chunk) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      const { frames, rest } = decodeFrames(client.buffer);
      client.buffer = rest;
      for (const f of frames) {
        if (f.opcode === 'close') { socket.destroy(); continue; }
        if (f.opcode === 0x1 && f.text !== undefined) robot.handleText(client, f.text);
      }
    });
    socket.on('close', () => robot.removeClient(client));
    socket.on('error', () => robot.removeClient(client));
  });

  return new Promise((resolve) => {
    server.listen(opts.port || 0, '127.0.0.1', () => {
      resolve({ robot, server, port: server.address().port, close: () => robot.close() });
    });
  });
}

module.exports = { startMockRobot, encodeFrame, decodeFrames, PROTOCOL_VERSION, COMMAND_TTL_MS };
