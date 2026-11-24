# Tabla de pines y conexiones

> **Fuente única:** `firmware/esp32s3_robot/Config.h`. Esta tabla debe coincidir
> con ese archivo. Estado: `CONFIRMADO` / `PROPUESTO` (a validar en placa).

## 1. ESP32-S3 — asignación de pines (sensores en uso desde 2026-11-24)

| Señal | GPIO | Dirección | Notas |
|-------|-----:|-----------|-------|
| I²C SDA (brújula + color) | 8 | I/O | Bus compartido, pull-ups 4.7 kΩ |
| I²C SCL (brújula + color) | 9 | O | Bus compartido |
| HC-SR04 frontal TRIG | 40 | O | Pulso de disparo |
| HC-SR04 frontal ECHO | 41 | I | **Divisor 5 V → 3.3 V obligatorio** |
| HC-SR04 izquierdo TRIG | 38 | O | Pulso de disparo |
| HC-SR04 izquierdo ECHO | 39 | I | **Divisor 5 V → 3.3 V obligatorio** |
| HC-SR04 derecho TRIG | 10 | O | Pulso de disparo |
| HC-SR04 derecho ECHO | 11 | I | **Divisor 5 V → 3.3 V obligatorio** |
| TB6612 AIN1 (motor izq.) | 4 | O | Dirección |
| TB6612 AIN2 (motor izq.) | 5 | O | Dirección |
| TB6612 PWMA (motor izq.) | 6 | O | PWM (LEDC) |
| TB6612 BIN1 (motor der.) | 7 | O | Dirección |
| TB6612 BIN2 (motor der.) | 15 | O | Dirección |
| TB6612 PWMB (motor der.) | 16 | O | PWM (LEDC) |
| TB6612 STBY | 18 | O | Bajo = driver deshabilitado (seguro) |
| Encoder izq. A | 12 | I | Interrupción |
| Encoder izq. B | 13 | I | Interrupción |
| Encoder der. A | 14 | I | Interrupción |
| Encoder der. B | 21 | I | Interrupción |
| Botón de parada | 47 | I | Pull-up; a GND. Implementado en firmware; prueba física sin registrar |

> **Encoder del motor TT:** el motor elegido trae **una sola salida** (canal A).
> Los pines B (GPIO13 y GPIO21) quedan **reservados** y `ENCODER_USE_QUADRATURE=0`
> en `Config.h`. No cuentes con cuadratura hasta confirmar el componente comprado.

### Pines NO usados (reservados)

| Rango | Motivo |
|-------|--------|
| GPIO 0, 3, 45, 46 | Strapping (afectan el arranque) |
| GPIO 19, 20 | USB nativo (USB-JTAG) |
| GPIO 26–37 | Flash/PSRAM internos |

## 2. ESP32-S3 ↔ TB6612FNG

| TB6612 | ESP32-S3 | Nota |
|--------|----------|------|
| VCC | 3.3 V | Lógica del driver |
| GND | GND | Común |
| VM | 6 V (Buck A) | Alimentación de motores |
| STBY | GPIO18 | Bajo al arrancar = seguro |
| AIN1/AIN2/PWMA | GPIO4/5/6 | Motor izquierdo |
| BIN1/BIN2/PWMB | GPIO7/15/16 | Motor derecho |
| AO1/AO2 | Motor izq. | |
| BO1/BO2 | Motor der. | |

> **Sentido de los motores:** se corrige por software; el montaje actual usa
> `MOTOR_L_INVERT=1` y `MOTOR_R_INVERT=0` en `Config.h`.

## 3. ESP32-S3 ↔ sensores

### GY-271 (QMC5883L) — I²C, dirección `0x0D`

| GY-271 | ESP32-S3 |
|--------|----------|
| VCC | 3.3 V |
| GND | GND |
| SDA | GPIO8 |
| SCL | GPIO9 |

### TCS34725 — I²C, dirección `0x29`

| TCS34725 | ESP32-S3 |
|----------|----------|
| VCC | 3.3 V |
| GND | GND |
| SDA | GPIO8 |
| SCL | GPIO9 |

### HC-SR04 — GPIO (¡no I²C!)

| Sensor | TRIG | ECHO | Nota |
|--------|-----:|-----:|------|
| Frontal | GPIO40 | GPIO41 | ECHO con divisor 1 kΩ / 2 kΩ |
| Izquierdo | GPIO38 | GPIO39 | ECHO con divisor 1 kΩ / 2 kΩ |
| Derecho | GPIO10 | GPIO11 | ECHO con divisor 1 kΩ / 2 kΩ |

> **ECHO entrega 5 V.** Sin el divisor se daña el GPIO del ESP32-S3.
> Divisor por sensor: ECHO → R1 (1 kΩ) → nodo GPIO → R2 (2 kΩ) → GND.
> El firmware dispara los tres sensores escalonados 30 ms y usa un periodo de
> 90 ms para evitar diafonía.

## 4. Alimentación

```
Batería 3S → BMS → [interruptor + fusible] →┬─ Buck A (6 V) → VM TB6612 → motores
                                            └─ Buck B (5 V) → 5 V ESP32-S3
GND común: batería = BMS = ambos buck = TB6612 = ESP32-S3 = sensores
```

## 5. Pendientes de esta tabla

- Confirmar encoders del motor TT: **número de pulsos por revolución**
  (`[POR DEFINIR]`, se medirá empíricamente).
- ✅ Confirmado en banco (T-Motor-01, 2026-11-07): `STBY=LOW` en reposo y
  `STBY=HIGH` tras `ARM`; `STOP` vuelve a `LOW`.
- ✅ Los tres HC-SR04, la brújula y el sensor de color funcionan en el robot
  (2026-11-24); desfase ≈2 mm en distancias cortas (pie de rey) y ≈2 cm a más de 20 cm (metro).
- Registrar la prueba del botón de parada (GPIO 47); los encoders no se usan.
