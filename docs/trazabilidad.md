# Matriz de trazabilidad

Relaciona **requisito â†’ mÃ³dulo de firmware â†’ tipo de prueba**. Las pruebas se
detallan en la fase correspondiente; aquÃ­ se fija quÃ© debe cubrir cada una.

Leyenda de tipo: `HOST` = corre en el PC sin placa Â· `PLACA` = requiere la ESP32-S3.

| Requisito | MÃ³dulo(s) de firmware | Prueba(s) | Tipo | Estado |
|-----------|-----------------------|-----------|------|--------|
| RF-01 Manual | `MotorDriver`, `ControlManual`, `FSMGlobal` | T-Manual-01 movimiento, T-Manual-02 parada | PLACA | PENDIENTE |
| RF-02 Voz | `Protocol` (comandos), `ControlManual` (`app/shared/commands.js`) | T-Voz-01 mapeo vozâ†’comando | HOST | **T-Voz-01 PASADA** (host); voz real PENDIENTE |
| RF-03 FSM | `FSMGlobal` | T-FSM-01 exclusiÃ³n manual/autÃ³nomo | HOST | PENDIENTE |
| RF-04 BrÃºjula | `Compass`, `HeadingControl` (F4: `Compass` implementado) | T-Comp-01 lectura, T-Comp-02 calibraciÃ³n, T-Ang-01 normalizaciÃ³n | PLACA + HOST | T-Ang-01 **PASADA** (host); resto PENDIENTE |
| RF-05 Color | `ColorSensor` (implementado) | T-Color-01 umbrales, T-Color-02 clasificaciÃ³n | PLACA + HOST | T-Color-02 **PASADA** (host); T-Color-01 PENDIENTE |
| RF-06 ObstÃ¡culos | `ObstacleSensor`, `NavigationFSM` (F4: `ObstacleSensor` implementado) | T-Obs-01 detecciÃ³n, T-Obs-02 maniobra, T-ObsD-01 conversiÃ³n | PLACA + HOST | T-ObsD-01 **PASADA** (host); resto PENDIENTE |
| RF-07 Comms | `Wireless`, `Protocol`, `Telemetry` (`app/shared/protocol.js`, `tests/host/mock_robot_server.js`) | T-Proto-01 parseo/validaciÃ³n, T-WD-01 watchdog de enlace | HOST + PLACA | **T-Proto-01 y T-WD-01 PASADAS** (host); firmware PLACA PENDIENTE |
| RF-08 App web | `app/web/*` | T-App-01 telemetrÃ­a, T-App-02 comandos | HOST | LÃ³gica compartida **PASADA**; UI DOM PENDIENTE (navegador) |
| RF-09 JARVIS | `app/shared/jarvis.js` | T-Jarvis-01 respuestas desde estado | HOST | **T-Jarvis-01 PASADA** (host) |
| RNF-01 Seguridad | `Safety`, `MotorDriver` | T-Safe-01 estado seguro al arrancar | HOST + PLACA | **T-00 (parcial)** |
| RNF-02 No bloqueo | todos | revisiÃ³n de cÃ³digo (sin `delay` > 5 ms) | HOST | **F4 revisada** (HC-SR04 no bloqueante) |
| RNF-07 Entorno | toolchain | T-Build-01 compilaciÃ³n | HOST | **PASADA** (v0.2.0, `--warnings all`) |

## Pruebas ya definidas

| ID | Objetivo | Entrada | Salida esperada | Tipo | Estado |
|----|----------|---------|-----------------|------|--------|
| **T-Build-01** | El firmware compila | `arduino-cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi --warnings all` | exit 0, sin errores ni warnings | HOST | **PASADA** |
| **T-Safe-01** | Motores en estado seguro al arrancar | encender la placa sin driver | banner + motores detenidos (STBY bajo) | PLACA | PENDIENTE |
| **T-I2C-01** | Detectar sensores IÂ²C | conectar brÃºjula (0x0D) y color (0x29) | escÃ¡ner lista 0x0D y 0x29 | PLACA | PENDIENTE |
| **T-Heartbeat-01** | Latido serie | monitor a 115200 | lÃ­nea de latido cada 1 s | PLACA | PENDIENTE |
| **T-Ang-01** | NormalizaciÃ³n angular |  | error en [-180,180); nunca +180 | HOST | **PASADA** |
| **T-Color-02** | ClasificaciÃ³n de color |  | 6 colores correctos; otrosâ†’desconocido | HOST | **PASADA** |
| **T-ObsD-01** | ConversiÃ³n distancia HC-SR04 |  | `cm = usÂ·0.0343/2`; rango y bloqueo | HOST | **PASADA** |
| **T-Voz-01** | Mapeo voz/texto â†’ comando | `tests/host/test_commands.js` | frases â†’ comandos correctos; estop prioritario | HOST | **PASADA** |
| **T-Proto-01** | Parseo/validaciÃ³n del protocolo v1 | `tests/host/test_protocol.js` | vÃ¡lidos OK; invÃ¡lidos â†’ cÃ³digo correcto | HOST | **PASADA** |
| **T-WD-01** | Deadman / watchdog de enlace | `tests/host/test_ws_integration.js` | drive sin refresco â†’ motores se detienen | HOST | **PASADA** |
| **T-WS-01** | IntegraciÃ³n WS extremo a extremo | `tests/host/test_ws_integration.js` | handshake, ping, mode, drive, estop, telemetrÃ­a | HOST | **PASADA** |
| **T-Jarvis-01** | JARVIS responde desde telemetrÃ­a | `tests/host/test_jarvis.js` | usa datos reales; sin dato NO inventa | HOST | **PASADA** |

> Las pruebas **HOST** (`.py` con `python` y `.js` con `node`) verifican la
> **lÃ³gica pura**; se ejecutan con `pruebas`. Las pruebas
> **PLACA** requieren hardware y quedan PENDIENTES. La UI DOM necesita un
> navegador (pendiente). No se marca `PASADA` sin evidencia real (log o captura).