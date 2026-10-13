# Tabla de pines y conexiones

> **Fuente única:** `firmware/esp32s3_robot/Config.h`. Esta tabla debe coincidir
> con ese archivo. Estado: `CONFIRMADO` / `PROPUESTO` (a validar en placa).

## 1. ESP32-S3 — asignación de pines (PROPUESTO)

| Señal | GPIO | Dirección | Notas |
|-------|-----:|-----------|-------|
| I²C SDA (brújula + color) | 8 | I/O | Bus compartido, pull-ups 4.7 kΩ |
| I²C SCL (brújula + color) | 9 | O | Bus compartido |
| HC-SR04 TRIG | 10 | O | Pulso de disparo |
| HC-SR04 ECHO | 11 | I | **Divisor 5 V → 3.3 V obligatorio** |
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
| Botón de parada (futuro) | 47 | I | Pull-up; a GND. PROPUESTO |

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

| HC-SR04 | ESP32-S3 |
|---------|----------|
| VCC | 5 V |
| GND | GND |
| TRIG | GPIO10 |
| ECHO | GPIO11 **a través de divisor 1 kΩ / 2 kΩ** |

> **ECHO entrega 5 V.** Sin el divisor se daña el GPIO del ESP32-S3.
> Divisor: ECHO → R1 (1 kΩ) → nodo GPIO11 → R2 (2 kΩ) → GND.

## 4. Alimentación

```
Batería 3S → BMS → [interruptor + fusible] →┬─ Buck A (6 V) → VM TB6612 → motores
                                            └─ Buck B (5 V) → 5 V ESP32-S3
GND común: batería = BMS = ambos buck = TB6612 = ESP32-S3 = sensores
```

## 5. Pendientes de esta tabla

- Confirmar encoders del motor TT: **número de pulsos por revolución**
  (`[POR DEFINIR]`, se medirá empíricamente).
- Confirmar lógica de TB6612 en modo *standby* (estado seguro real en placa).
- Confirmar si el HC-SR04 va a 11 (GPIO) o si se migra a **VL53L0X** (I²C).
- Validar todos los GPIO con un test de existencia en la placa real.
