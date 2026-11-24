# Matriz de trazabilidad

Relaciona **requisito → módulo de firmware → tipo de prueba**. Las pruebas se
detallan en la fase correspondiente; aquí se fija qué debe cubrir cada una.

Estados: `PASADA` = cumple la salida esperada, con evidencia archivada ·
`FUNCIONA` = el autor la vio funcionar en el robot el 2026-11-24, sin log ni
mediciones · `PARCIAL` · `PENDIENTE`.

Leyenda de tipo: `HOST` = corre en el PC sin placa · `PLACA` = requiere la ESP32-S3.

| Requisito | Módulo(s) de firmware | Prueba(s) | Tipo | Estado |
|-----------|-----------------------|-----------|------|--------|
| RF-01 Manual | `MotorDriver`, `ControlManual`, `FSMGlobal` | T-Motor-01 banco, T-Manual-00 serie, T-Manual-01 movimiento desde app, T-Manual-02 parada desde app | PLACA | **T-Motor-01 y T-Manual-00 PASADAS** (2026-11-07, v0.2.0); comunicación con la app FUNCIONA; T-Manual-01/02 sin registro individual |
| RF-02 Voz | `Protocol` (comandos), `ControlManual` (`app/shared/commands.js`) | T-Voz-01 mapeo voz→comando, T-Voz-02 voz real | HOST + PLACA | **T-Voz-01 PASADA** (host); T-Voz-02 (voz real) **FUNCIONA** (2026-11-24) |
| RF-03 FSM | `FSMGlobal` (implementado) | T-FSM-01 exclusión manual/autónomo | HOST | PENDIENTE (módulo implementado; el evitador automático en MANUAL quedó desactivado con `MANUAL_AUTO_AVOID=0` en v0.4.0-nav) |
| RF-04 Brújula | `Compass`, `Navigator` (control P de rumbo) | T-Comp-01 lectura, T-Comp-02 calibración, T-Ang-01 normalización, T-Nav-01 control de rumbo | PLACA + HOST | T-Ang-01 y T-Nav-01 **PASADAS** (host); **T-Comp-01 FUNCIONA** (2026-11-24); T-Comp-02 sin registro |
| RF-05 Color | `ColorSensor` (clasificación por tono), `tools/calibrar_color.py` | T-Color-01 calibración en placa, T-Color-02 clasificación | PLACA + HOST | **T-Color-01 PASADA** (CSV 2026-11-23); en el montaje final, 450 muestras, 100 % de aciertos; **T-Color-02 PASADA** (host: 32 casos + las 450 lecturas); funciona en el robot (2026-11-24) |
| RF-06 Obstáculos | `ObstacleSensor`, `Navigator` (EVADIR→BORDEAR→REORIENTAR, o VOLVER→ALINEAR en línea) | T-Obs-01 detección, T-Obs-02 maniobra, T-Nav-02 evasión y retorno al rumbo (host), T-ObsD-01 conversión, T-ObsD-02 configuración de 3 sensores | PLACA + HOST | T-ObsD-01 y T-ObsD-02 **PASADAS** (host); **T-Obs-01 FUNCIONA** (los 3; desfase ≈2 mm en distancias cortas (pie de rey) y ≈2 cm a más de 20 cm (metro)); T-Obs-02 FUNCIONA |
| RF-07 Comms | `Wireless`, `Protocol`, `Telemetry` (`app/shared/protocol.js`, `tests/host/mock_robot_server.js`) | T-Proto-01 parseo/validación, T-WD-01 watchdog de enlace, T-WS-02 servidor en placa | HOST + PLACA | **T-Proto-01 y T-WD-01 PASADAS** (host); **T-WS-02 FUNCIONA** (2026-11-24) |
| RF-08 App Streamlit / web | `app/streamlit/*` (principal), `app/web/*` | T-App-01 telemetría, T-App-02 comandos, T-Stl-01 voz/JARVIS en Python | HOST | Lógica **PASADA** (`test_streamlit_logic.py`); `RobotLink` probado contra el robot simulado; conexión con la placa **FUNCIONA** (2026-11-24) |
| RF-09 JARVIS | `app/shared/jarvis.js`, `app/streamlit/jarvis.py` (estado completo + voz TTS) | T-Jarvis-01 respuestas desde estado, T-Stl-01, T-Jarvis-02 con el robot | HOST + PLACA | **T-Jarvis-01 y T-Stl-01 PASADAS** (host); T-Jarvis-02 **FUNCIONA** (2026-11-24) |
| RNF-01 Seguridad | `FSMGlobal`, `MotorDriver`, `ControlManual` | T-Safe-01 arranque seguro, T-Motor-01, T-Manual-00 deadman, T-Estop-01 pulsador | HOST + PLACA | **T-Safe-01 y T-Motor-01 PASADAS**; **T-Manual-00 PASADA en v0.2.0** (deadman 3 s/10 s; revalidación en v0.4.0-nav sin registrar); T-Estop-01 sin registro |
| RNF-02 No bloqueo | todos | revisión de código (sin `delay` > 5 ms) | HOST | **F4/5 revisada** (3× HC-SR04 no bloqueantes, ISR por instancia; control manual sin `delay`) |
| RNF-07 Entorno | toolchain | T-Build-01 compilación | HOST | **PASADA** (firmware principal y banco de motores, `--warnings all`) |

## Pruebas ya definidas

| ID | Objetivo | Entrada | Salida esperada | Tipo | Estado |
|----|----------|---------|-----------------|------|--------|
| **T-Build-01** | El firmware compila | `arduino-cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi --warnings all` | exit 0, sin errores ni warnings | HOST | **PASADA** (`esp32s3_robot` y `tt_motor_test`) |
| **T-Motor-01** | Motores TT con TB6612: sentido, PWM, STBY y deadman | `firmware/tt_motor_test` + monitor serie | `ARM` obligatorio; cada motor gira según comando; `STOP` deja STBY bajo; deadman a los 3 s en movimiento y 10 s armado sin uso | PLACA | **PASADA** (2026-11-07; evidencia: log serie) |
| **T-Manual-00** | Control manual por serie en el firmware principal | `firmware/esp32s3_robot` + monitor serie; ruedas levantadas | `ARM` deja `STBY=HIGH`; `FWD/BACK/LEFT/RIGHT` aplican consigna; `STOP` deja `STBY=LOW`; deadman a 3 s en movimiento y 10 s armado | PLACA | **PASADA en v0.2.0** (2026-11-07; log: `ARM`, `FWD 20`, `STOP`, deadman 3 s/10 s); revalidación en v0.4.0-nav sin registrar |
| **T-Safe-01** | Motores en estado seguro al arrancar | encender la placa con driver | banner + motores detenidos (STBY bajo) | PLACA | **PASADA** (v0.2.0; arranque v0.3.0-ws confirma banner y estado seguro por log) |
| **T-Estop-01** | Pulsador de emergencia y enclavamiento | pulsar `ESTOP_BUTTON_PIN` (GPIO 47) | motores detenidos, `STBY=LOW`, estado `SAFE` hasta reiniciar | PLACA | PENDIENTE (no confirmada individualmente) |
| **T-I2C-01** | Detectar sensores I²C | conectar brújula (0x0D) y color (0x29) | escáner lista 0x0D y 0x29 | PLACA | **FUNCIONA** (autor, 2026-11-24): brújula y color operan. El 2026-11-09 `0x0D` no respondía |
| **T-Heartbeat-01** | Latido serie | monitor a 115200 | línea de latido cada 1 s | PLACA | **PASADA** (2026-11-07; `[HB]` cada ~1 s) |
| **T-Ang-01** | Normalización angular |  | error en [-180,180); nunca +180 | HOST | **PASADA** |
| **T-Color-01** | Calibración y verificación de los 6 colores en placa | `python tools\calibrar_color.py` (3 posiciones × 25 lecturas por color) | ≥ 95 % por color, contraste blanco/negro ≥ 1,8 | PLACA | **PASADA**: 450 muestras, 100 % de aciertos; datos en `tools/datos_color/color_2026-11-23_1329.csv` |
| **T-Color-02** | Clasificación de color | `tests/host/test_color.py` | 6 colores correctos; magenta/violeta→desconocido; robusto a reflejos | HOST | **PASADA** (32 casos + 450 lecturas reales de la calibración 2026-11-23) |
| **T-ObsD-01** | Conversión distancia HC-SR04 |  | `cm = us·0.0343/2`; rango y bloqueo | HOST | **PASADA** |
| **T-ObsD-02** | Configuración de 3 HC-SR04 | `tests/host/test_obstacle.py` | periodo cubre 3 timeouts; separación ≥ timeout; 3 fases caben en el periodo | HOST | **PASADA** |
| **T-Obs-01** | Detección con 3 HC-SR04 en placa | `SENSORS` con obstáculos a distancias conocidas | lecturas válidas y repetibles en frontal/izquierdo/derecho | PLACA | **FUNCIONA** (autor, 2026-11-24): desfase ≈2 mm en distancias cortas (pie de rey) y ≈2 cm a más de 20 cm (metro) |
| **T-Voz-01** | Mapeo voz/texto → comando | `tests/host/test_commands.js` | frases → comandos correctos; estop prioritario | HOST | **PASADA** |
| **T-Nav-01** | Control P de rumbo | `tests/host/test_navigator.py` | error + → girar a la derecha; cruce 350→10 por el camino corto; error > 45° → giro en sitio | HOST | **PASADA** |
| **T-Nav-02** | Evasión y retorno al trayecto | `tests/host/test_navigator.py` (simulación cinemática) | NAVEGAR→EVADIR→BORDEAR→REORIENTAR→NAVEGAR y rumbo final a ±10° del deseado | HOST | **PASADA** |
| **T-Stl-01** | Voz y JARVIS de la app Streamlit | `tests/host/test_streamlit_logic.py` | comandos correctos (incl. «rumbo N»); JARVIS usa la telemetría y no inventa datos | HOST | **PASADA** |
| **T-Nav-03** | Navegación autónoma en pista | `HEAD 90` + `AUTO RUMBO` (serie) o app; obstáculo en la trayectoria | lo esquiva y vuelve a ±10° de 90° | PLACA | **FUNCIONA** (autor, 2026-11-24); error de rumbo sin medir |
| **T-Nav-04** | Submodo línea en pista | `AUTO LINEA` o app; obstáculo sobre la línea | lo rodea y retoma la línea | PLACA | **FUNCIONA CON DIFICULTAD** (autor, 2026-11-24): se perdió en 16 de 20 pruebas en curva (80 %): reconoce el color, pero al buscar gira más rápido de lo que el sensor tarda en leer (120 ms) |
| **T-Nav-05** | Submodo solo esquivar en pista | `AUTO EVADIR` o app | esquiva y sigue sin chocar | PLACA | **FUNCIONA** (autor, 2026-11-24) |
| **T-Proto-01** | Parseo/validación del protocolo v1 en ambas direcciones | `tests/host/test_protocol.js` | comandos y respuestas válidos OK; inválidos → código correcto | HOST | **PASADA** |
| **T-WD-01** | Deadman / watchdog de enlace | `tests/host/test_ws_integration.js` | drive sin refresco → motores se detienen | HOST | **PASADA** |
| **T-WS-01** | Integración WS extremo a extremo (simulada) | `tests/host/test_ws_integration.js` | handshake, ping, mode, drive, estop, telemetría | HOST | **PASADA** |
| **T-WS-02** | Servidor WiFi/WebSocket en la placa | `firmware/esp32s3_robot` + cliente real | AP visible, WS en `192.168.4.1:81`, handshake, telemetría 200 ms, deadman 500 ms, estop | PLACA | **FUNCIONA** (autor, 2026-11-24): comunicación con la app; periodos y deadman sin medir |
| **T-Jarvis-01** | JARVIS responde desde telemetría | `tests/host/test_jarvis.js` | usa datos reales; sin dato NO inventa | HOST | **PASADA** |
| **T-Jarvis-02** | JARVIS con el robot conectado | botón «Hablar» o texto | responde | PLACA | **FUNCIONA** (autor, 2026-11-24) |
| **T-Voz-02** | Voz con micrófono real | órdenes habladas | el robot ejecuta la orden | PLACA | **FUNCIONA** (autor, 2026-11-24) |
| **T-Comp-01** | Lectura de la brújula en el robot | girar el robot | el rumbo cambia de forma coherente | PLACA | **FUNCIONA** (autor, 2026-11-24); sin medir error |

> Las pruebas **HOST** (`.py` con `python` y `.js` con `node`) verifican la
> **lógica pura**; se ejecutan con `python tests\host\run_all.py`. Las pruebas
> **PLACA** requieren hardware. El 2026-11-24 el autor reportó funcionando los
> sensores, la comunicación, la voz, JARVIS y los tres submodos: esas pruebas figuran como
> `FUNCIONA`. No se marca `PASADA` sin evidencia archivada (log, captura o
> video); al guardarla, cambiar el estado y enlazarla.
