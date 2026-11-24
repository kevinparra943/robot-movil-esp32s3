# Firmware — ESP32-S3 (sensores + control manual + WiFi/WebSocket)

## Qué es

Firmware principal del robot. Integra el bring-up de **placa, toolchain y bus
I²C**, los módulos de sensores, el **control manual por serie** sobre el driver
TB6612 y el **servidor WiFi/WebSocket** con el protocolo JSON v1. Los motores
arrancan en **estado seguro** (`STBY=LOW`); para moverse requieren un `ARM`
explícito y caducan por deadman.

## Módulos

| Archivo | Responsabilidad | Fase |
|---------|-----------------|------|
| `Config.h` | Pines, versiones y constantes. **Única fuente de verdad.** | 2 |
| `Geometry.h` | Funciones puras de ángulos (sin hardware). | 4 |
| `Diagnostics.*` | Banner, escáner I²C, latido. | 2 |
| `MotorDriver.*` | Driver TB6612; `begin()` deja todo detenido. | 2 |
| `ControlManual.*` | ARM/STOP, consignas y deadman sobre `MotorDriver`. | 5 |
| `Compass.*` | Brújula QMC5883L: rumbo, calibración hard/soft-iron. | 4 |
| `ColorSensor.*` | TCS34725: lectura RGB y clasificación por umbrales calibrados (6/6 por color). | 4 |
| `ObstacleSensor.*` | 3× HC-SR04 **no bloqueante** (instancias independientes, disparo escalonado). | 4 |
| `Encoder.*` | Conteo de pulsos del motor TT (opcional, sin usar en control). | 4 |
| `FSMGlobal.*` | Modos `BOOT/IDLE/MANUAL/AUTONOMO/SAFE/ERROR` y E-stop enclavado. | 5 |
| `Navigator.*` | Piloto autónomo: control P de rumbo con la brújula, evasión y tres submodos: solo esquivar, rumbo y línea. | 6 |
| `Protocol.*` | Parseo y serialización del protocolo JSON v1. | 6 |
| `Telemetry.*` | Snapshot de sensores, motores y estado para telemetría. | 6 |
| `Wireless.*` | WiFi AP/STA y servidor WebSocket. | 6 |
| `esp32s3_robot.ino` | `setup()`/`loop()`, comandos serie, sondeo y telemetría. | 4/5/6 |

> **v0.4.0-nav:** añade `Navigator` (modo autónomo guiado por la brújula) y
> desactiva el evitador automático en modo MANUAL (`MANUAL_AUTO_AVOID=0`).
>
> Estado (2026-11-24): sensores, comunicación con la app, voz y JARVIS
> **funcionaron en el robot** (reportado por el autor, sin log archivado). El
> arranque deja `STBY=LOW`; `ARM` habilita y `STOP`/`DISARM` deshabilita. El
> deadman serie es de 10 s en movimiento y 30 s armado (`Config.h`). T-Manual-00
> se hizo con v0.2.0; su revalidación por serie no está registrada.
>
> El sketch [`../tt_motor_test/`](../tt_motor_test/README.md) se conserva como
> banco de pruebas aislado del tren de potencia.

## Compilar

Arduino IDE: placa **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**, monitor a 115200.

Línea de comandos (Windows):

```powershell
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi --warnings all firmware\esp32s3_robot
```

## Comandos por el monitor serie

| Comando | Respuesta |
|---------|-----------|
| `HELP` | lista de comandos y tiempos de deadman |
| `PING` | `PONG <version>` |
| `SCAN` | rehace el barrido I²C |
| `STATUS` | modo, armado, E-stop, `STBY`, clientes WebSocket y consignas |
| `NET` / `WIFI` / `WS` | estado de red: AP, STA, IP, canal y clientes WebSocket |
| `SENSORS` | lectura puntual de brújula, color, distancias frontal/izquierda/derecha y encoders |
| `CAL-ZERO` | pone a cero los contadores de los encoders |
| `ARM` | habilita el driver (`STBY=HIGH`) |
| `DISARM` / `STOP` | detiene y deshabilita (`STBY=LOW`) |
| `FWD [0-100]` | ambos motores adelante (40 % por defecto) |
| `BACK [0-100]` | ambos motores atrás |
| `LEFT [0-100]` | giro izquierda (izquierdo atrás, derecho adelante) |
| `RIGHT [0-100]` | giro derecha |
| `L [-100..100]` | solo motor izquierdo (signo = sentido) |
| `R [-100..100]` | solo motor derecho |
| `AUTO EVADIR\|RUMBO\|LINEA` | modo autónomo con ese submodo (`RUMBO` exige antes `HEAD n`; `STOP` para salir) |
| `HEAD [0-359]` | fija el rumbo deseado; `HEAD` sin argumento lo borra |

Ejemplo de prueba en banco (ruedas levantadas):

```text
ARM
FWD 20
STATUS
STOP
```

## Servidor WiFi/WebSocket

El firmware levanta un AP propio y un servidor WebSocket:

- SSID: `robot-esp32s3`
- Password: `robot1234`
- IP del AP: `192.168.4.1`
- URL: `ws://192.168.4.1:81`
- Protocolo: JSON v1 ([`../../docs/protocolo_comunicacion.md`](../../docs/protocolo_comunicacion.md))
- Telemetría cada `TELEMETRY_PERIOD_MS = 200` ms.
- Deadman WebSocket: `COMMAND_TTL_MS = 500` ms (por serie, 10 s/30 s).

Estado: la conexión real desde la app **funcionó** (2026-11-24). Antes, el log
serie ya confirmaba el AP en canal 6, la IP `192.168.4.1` y el puerto 81.

## Criterios de aceptación

### Bring-up y sensores (T-00 / Fase 4)

1. **Compila** sin errores ni advertencias (`--warnings all`) (T-Build-01).
2. Al arrancar imprime el banner y deja los motores detenidos (T-Safe-01).
3. El escáner I²C detecta `0x0D` (brújula) y `0x29` (color) si están conectados.
4. El latido aparece cada ~1 s en el monitor serie a 115200.
5. `SENSORS` muestra rumbo, color clasificado, distancias frontal/izquierda/
   derecha y pulsos de encoder. La brújula y los sensores sin eco pueden salir
   inválidos (se indica explícitamente). **Los sensores funcionaron el 2026-11-24.**

### Control manual por serie (T-Manual-00)

1. `ARM` deja `STBY=HIGH`; `STATUS` muestra `armed=YES` y `mode=MANUAL`.
2. `FWD`, `BACK`, `LEFT` y `RIGHT` aplican la consigna a ambos motores; `L` y
   `R` permiten probar un motor cada vez.
3. `STOP` deja `STBY=LOW` y `armed=NO`.
4. Sin refrescar la consigna, el deadman detiene y desarma a los 10 s en
   movimiento y a los 30 s armado sin usar.
5. El sentido se corrige en `Config.h`: hoy `MOTOR_L_INVERT=1` y
   `MOTOR_R_INVERT=0`.

### Servidor WiFi/WebSocket en placa (T-WS-02, funciona)

1. El AP `robot-esp32s3` es visible y asigna IP `192.168.4.1`; el servidor
   escucha en el puerto 81.
2. Un cliente envía `hello` y recibe `hello_ack`; la telemetría llega cada
   ~200 ms.
3. `drive` se acepta en `idle/manual`, se rechaza en `autonomo` y caduca a los
   500 ms sin refresco.
4. `estop` detiene los motores, desarma y queda enclavado hasta reiniciar.
5. La app web conecta a `ws://192.168.4.1:81` y muestra telemetría real.

> La comunicación funcionó el 2026-11-24. Los tiempos (200 ms, 500 ms) y cada
> punto por separado no se midieron ni se registraron.

## Seguridad

- El firmware arranca siempre con `STBY=LOW` y motores detenidos.
- Para pruebas de movimiento, **levanta las ruedas** o deja el robot sobre un
  soporte. Usa `STOP` ante cualquier duda.
- El pulsador de emergencia está en `ESTOP_BUTTON_PIN` (GPIO 47) con
  `INPUT_PULLUP`; al activarse deja `STBY=LOW` y el estado `SAFE` queda
  enclavado hasta reiniciar.
- El deadman WebSocket es de 500 ms; si el cliente deja de refrescar `drive`,
  el firmware detiene los motores y desarma.
- Los motores se alimentan desde el TB6612 con la fuente de 6 V; nunca desde
  los GPIO ni desde el regulador del ESP32-S3.
- GND común entre batería, driver, MCU y sensores.
