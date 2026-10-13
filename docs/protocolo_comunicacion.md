# Protocolo de comunicación (v1)

Transporte inicial: **WebSocket sobre WiFi**, mensajes en **texto JSON**, uno por
frame. Cada mensaje es un objeto con un campo `t` (tipo). Los mensajes van
**versionados** en el handshake.

## 1. Estructura general

Campos comunes:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `t` | string | Tipo de mensaje (ver tabla) |
| `v` | int | Versión del protocolo (actualmente `1`) |
| `ts` | int | Marca de tiempo en ms (cuando aplique) |

Regla: si falta `t` o `v` no coincide → se responde `error` y se ignora.

## 2. Cliente → ESP32-S3 (comandos)

| `t` | Campos | Respuesta | Notas |
|-----|--------|-----------|-------|
| `hello` | `v` | `hello_ack` | handshake; fija versión |
| `ping` | — | `pong` | prueba de enlace |
| `mode` | `value`: `"manual"`/`"autonomo"` | `ack` | cambia modo (excluyentes) |
| `drive` | `dir`: `fwd`/`back`/`left`/`right`/`stop`, `speed` 0–100 | `ack` | **caduca** (deadman) |
| `heading` | `deg`: 0–359 | `ack` | rumbo deseado (autónomo/manual) |
| `calib` | `what`: `compass`/`color`, `action`: `start`/`save` | `ack`/`status` | calibraciones |
| `estop` | — | `ack` | parada de emergencia |
| `status` | — | `status` | fuerza telemetría inmediata |

**Caducidad (deadman):** un comando `drive` solo es válido durante
`COMMAND_TTL_MS` (p. ej. 500 ms). El cliente debe refrescarlo; si no, los
motores se detienen. Implementado con marca de tiempo por comando.

## 3. ESP32-S3 → Cliente

### `telemetry` (snapshot periódico, p. ej. cada 200 ms)

```json
{
  "t": "telemetry", "v": 1, "ts": 123456,
  "mode": "autonomo",
  "conn": true,
  "heading": {"actual": 87.5, "target": 90.0, "error": -2.5},
  "color": {"name": "verde", "rgb": [120, 200, 90], "valid": true},
  "obstacle": {"distance_cm": 34.2, "valid": true, "blocked": false},
  "motors": {"left": 60, "right": 60, "state": "moving"},
  "nav": {"state": "AVANZANDO", "level": 1},
  "estop": false
}
```

### `event` (cuando ocurre algo relevante)

```json
{"t":"event","v":1,"ts":123457,"code":"OBSTACLE_DETECTED","detail":"34.2 cm"}
```

### `status` / `ack` / `error`

```json
{"t":"ack","v":1,"of":"mode","value":"manual"}
{"t":"error","v":1,"code":"BAD_FORMAT","detail":"campo 'dir' invalido"}
```

## 4. Códigos de error

| `code` | Significado |
|--------|-------------|
| `BAD_FORMAT` | JSON inválido o campo faltante/tipo erróneo |
| `UNKNOWN_CMD` | `t` desconocido |
| `UNSUPPORTED` | comando válido pero no permitido en el modo actual |
| `SAFETY` | rechazado por parada de emergencia activa |
| `I2C_ERROR` | sensor I²C no responde |
| `SENSOR_INVALID` | lectura fuera de rango / brújula sin calibrar |
| `VERSION_MISMATCH` | versión de protocolo no soportada |

## 5. Requisitos de robustez

- Validar tipos y rangos de todos los campos antes de actuar (RF-07).
- Los comandos con argumentos deben respetar el modo activo (RF-03).
- La telemetría distingue **dato válido**, **dato no disponible** (`null`) y
  **dato inválido** (`"valid": false`), no los mezcla (RF-08).
- Ante cualquier fallo de parseo: **no** ejecutar y responder `error`.

## 6. Versionado

- `PROTOCOL_VERSION` en `Config.h`.
- Cambios incompatibles → incrementan la versión mayor; el firmware y la app
  comparan versión en `hello` y avisan de desajustes.

## 7. Implementaciones de referencia

| Dónde | Qué |
|-------|-----|
| `app/shared/protocol.js` | Cliente del protocolo (parseo/validación/construcción) usado por la app web. |
| `tests/host/mock_robot_server.js` | Robot **simulado** (WebSocket) para pruebas sin hardware. |
| `tests/host/test_protocol.js` | Pruebas de validación del protocolo v1. |
| `tests/host/test_ws_integration.js` | Prueba extremo a extremo (handshake, deadman, estop). |
| `firmware/esp32s3_robot/Protocol` | *(pendiente)* lado del firmware. |

Todas las partes comparten los mismos códigos de error y el mismo TTL de comando
(`COMMAND_TTL_MS`). Cualquier cambio aquí debe reflejarse en las tres.
