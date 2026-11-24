# Pruebas de motores TT con TB6612FNG

Sketch **separado** para validar el tren de potencia antes de integrar la
navegación. No sustituye al firmware de sensores y no se ejecuta si no se carga
a propósito.

> **Estado:** firmware compilado y **probado en hardware el 2026-11-07**
> (T-Motor-01). Resultados registrados en las tablas de abajo.

## 1. Seguridad antes de conectar

- **Levanta las ruedas del suelo** o sujeta el robot en un banco.
- Motores alimentados desde el **buck de 6 V**, nunca desde el regulador de la
  ESP32-S3 ni desde un GPIO.
- **GND común** entre batería, BMS, buck, TB6612 y ESP32-S3.
- Verifica con multímetro: **VM ≈ 6 V**, **VCC = 3.3 V**, continuidad de GND.
- Revisa que **STBY (GPIO18)** llegue al TB6612 y que en reposo esté en **LOW**.
- Usa fusible y interruptor; no dejes la batería sin supervisión.
- Empieza con una sola rueda (`L 30` o `R 30`) antes de mover ambas.

## 2. Conexiones usadas

Tomadas de `firmware/esp32s3_robot/Config.h` y `hardware/pinout.md`:

| TB6612 | ESP32-S3 | Función |
|--------|----------|---------|
| VCC | 3.3 V | Lógica del driver |
| GND | GND común | Referencia |
| VM | 6 V (Buck A) | Potencia de motores |
| STBY | GPIO18 | Bajo = seguro |
| AIN1 / AIN2 / PWMA | GPIO4 / 5 / 6 | Motor izquierdo |
| BIN1 / BIN2 / PWMB | GPIO7 / 15 / 16 | Motor derecho |
| AO1 / AO2 | Motor izquierdo | Salida de potencia |
| BO1 / BO2 | Motor derecho | Salida de potencia |

## 3. Compilar y cargar

Arduino IDE: placa **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**, monitor a
**115200**.

Por línea de comandos:

```powershell
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi --warnings all firmware\tt_motor_test
```

Carga el sketch `firmware/tt_motor_test/tt_motor_test.ino` y abre el monitor
serie a 115200.

## 4. Comandos

| Comando | Acción |
|---------|--------|
| `HELP` | Muestra la ayuda. |
| `STATUS` | Estado de armado, consignas y fase de prueba. |
| `ARM` | Habilita el driver (`STBY=HIGH`). Obligatorio antes de mover. |
| `DISARM` / `STOP` | Detiene y deshabilita (`STBY=LOW`). |
| `FWD [0-100]` | Ambos motores adelante (por defecto 40 %). |
| `BACK [0-100]` | Ambos motores atrás. |
| `LEFT [0-100]` | Giro izquierda (izq. atrás, der. adelante). |
| `RIGHT [0-100]` | Giro derecha. |
| `L [-100..100]` | Solo motor izquierdo; el signo define el sentido. |
| `R [-100..100]` | Solo motor derecho. |
| `TEST [20-60]` | Secuencia automática: adelante, atrás, izquierda, derecha. |

**Deadman:** si pasan 3 s sin un comando nuevo mientras hay movimiento, el
sketch detiene los motores y deshabilita el driver. Si solo está armado y no se
usa, se desarma a los 10 s. Durante `TEST`, la secuencia tiene sus propios
tiempos.

## 5. Secuencia recomendada

1. Cargar el sketch y confirmar el banner con `STBY=LOW`.
2. `STATUS` → `armed=NO`.
3. `L 25` → debe rechazar por falta de `ARM`.
4. `ARM` → `armed=YES`.
5. `L 30` durante 1 s; observar sentido y escuchar el motor.
6. `STOP`; repetir con `R 30`.
7. `FWD 40`, `BACK 40`, `LEFT 40`, `RIGHT 40`.
8. `TEST 35` para la secuencia completa.
9. Anotar resultados y volver a `STOP`.

## 6. Qué comprobar

| Prueba | Resultado esperado | ¿OK? |
|--------|--------------------|------|
| Arranque sin `ARM` | No se mueve; `armed=NO` | ✅ |
| `STBY` en reposo | LOW (driver deshabilitado) | ✅ |
| Motor izquierdo `L 30` | Gira en el sentido esperado, sin reinicios | ✅ |
| Motor derecho `R 30` | Gira en el sentido esperado, sin reinicios | ✅ |
| `FWD 40` | Ambas ruedas avanzan | ✅ |
| `BACK 40` | Ambas ruedas retroceden | ✅ |
| `LEFT 40` | Gira a la izquierda | ✅ |
| `RIGHT 40` | Gira a la derecha | ✅ |
| Deadman | Tras 3 s sin comandos, se detiene y desarma | ✅ |
| `STOP` | Detención inmediata y `STBY=LOW` | ✅ |
| Temperatura | Driver y motores no se calientan en exceso | ☐ (no medida) |

Velocidad usada en esta sesión: 30–35 %.

Si un motor gira al revés, lo recomendable es invertir `AO1/AO2` o `BO1/BO2`
en el cableado. Si no se puede desmontar, usa `MOTOR_L_INVERT` o
`MOTOR_R_INVERT` en `Config.h` (1 = invertir) y documenta el cambio. Si el
ESP32 se reinicia al arrancar los motores, revisa alimentación, GND común y
desacoplo; no aumentes la velocidad.

## 7. Registro de la prueba

| Fecha | Responsable | Velocidad | Prueba | Resultado | Observaciones |
|-------|-------------|-----------|--------|-----------|---------------|
| 2026-11-07 | Equipo | 30–35 % | T-Motor-01 | ✅ PASADA | FWD/BACK/LEFT/RIGHT correctos; deadman 3 s/10 s; `STBY=LOW` al arrancar y tras `STOP`. Motor derecho invertido en el montaje, corregido con `MOTOR_R_INVERT=1`. Temperatura no medida. |
