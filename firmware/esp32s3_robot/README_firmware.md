# Firmware — ESP32-S3 (T-00 bring-up seguro)

## Qué es

Firmware mínimo para validar **placa, toolchain y bus I²C** antes de montar
potencia. Deja los motores en **estado seguro** (STBY en bajo).

## Módulos

| Archivo | Responsabilidad | Fase |
|---------|-----------------|------|
| `Config.h` | Pines, versiones y constantes. **Única fuente de verdad.** | 2 |
| `Geometry.h` | Funciones puras de ángulos (sin hardware). | 4 |
| `Diagnostics.*` | Banner, escáner I²C, latido. | 2 |
| `MotorDriver.*` | Driver TB6612; `begin()` deja todo detenido. | 2 |
| `Compass.*` | Brújula QMC5883L: rumbo, calibración hard/soft-iron. | 4 |
| `ColorSensor.*` | TCS34725: lectura RGB y clasificación por umbrales. | 4 |
| `ObstacleSensor.*` | HC-SR04 **no bloqueante** (medición por interrupción). | 4 |
| `Encoder.*` | Conteo de pulsos del motor TT (odometría básica). | 4 |
| `esp32s3_robot.ino` | `setup()`/`loop()`, comandos serie, sondeo no bloqueante. | 4 |

> Estado actual (v0.2.0): los motores permanecen **siempre** en estado seguro.
> El firmware solo lee sensores y responde por el monitor serie.

## Compilar

Arduino IDE: placa **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**, monitor a 115200.

Línea de comandos (Windows):

```powershell
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi firmware\esp32s3_robot
```

## Comandos por el monitor serie

| Comando | Respuesta |
|---------|-----------|
| `PING` | `PONG <version>` |
| `SCAN` | rehace el barrido I²C |
| `STATUS` | `STATUS,mode=DETENIDO,stby=LOW` |
| `SENSORS` | lectura puntual de brújula, color, distancia y encoders |
| `CAL-ZERO` | pone a cero los contadores de los encoders |

## Criterio de aceptación (T-00 / Fase 4)

1. **Compila** sin errores ni advertencias (`--warnings all`) (T-Build-01).
2. Al arrancar imprime el banner y deja los motores detenidos (T-Safe-01).
3. El escáner I²C detecta `0x0D` (brújula) y `0x29` (color) si están conectados.
4. El latido aparece cada ~1 s en el monitor serie a 115200.
5. `SENSORS` muestra rumbo, color clasificado, distancia y pulsos de encoder.
   Con el hardware aún no medido, la distancia y el rumbo pueden salir
   inválidos (se indica explícitamente).

## Seguridad

No conectar motores ni el driver TB6612 durante T-00. El objetivo es validar
electrónica de control, no potencia.
