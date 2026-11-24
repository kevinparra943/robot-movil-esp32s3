# Datos pendientes y decisiones por tomar

> Cada punto indica **dónde** se cambia, para que ninguna decisión quede
> enterrada en el firmware.

Estado: `🔴 BLOQUEANTE` impide avanzar · `🟡 IMPORTANTE` afecta al resultado ·
`🟢 MENOR` mejora · `🟢 OPCIONAL` no se usa en la versión actual.

## 1. Hardware

| ID | Dato | Estado | Dónde se cambia |
|----|------|--------|-----------------|
| H-01 | **Pulsos por revolución** del encoder del motor TT | 🟢 OPCIONAL (no se usa para control; solo si se añade odometría) | `Config.h` → `ENCODER_PPR` (medir a mano) |
| H-02 | Chasis fabricado: cotas, separación de ruedas, punto del caster | 🔴 | `Config.h` → `WHEEL_BASE_MM`, `WHEEL_DIAMETER_MM` |
| H-03 | Rueda de 6.5 cm: confirmar diámetro real y diámetro del eje | 🟡 | `Config.h` → `WHEEL_DIAMETER_MM` |
| H-04 | Divisores de ECHO de los 3 HC-SR04: valores reales | 🟡 Los 3 sensores funcionan (2026-11-24). Montaje con R1=1 kΩ / R2=2 kΩ (o 1.8 kΩ) por sensor; confirmar con multímetro | `hardware/pinout.md` §3 |
| H-05 | Confirmar que los GPIO propuestos existen/libres en la placa | 🟡 GPIO de sensores y motores en uso y funcionando (2026-11-24); encoders y botón GPIO 47 sin registrar | `hardware/pinout.md` |
| H-06 | Estado real de STBY del TB6612 en placa (seguro) | ✅ CONFIRMADO (T-Motor-01) | `MotorDriver.cpp` |
| H-07 | Sentido físico de los motores | ✅ Corregido por software: hoy se invierte el izquierdo (`MOTOR_L_INVERT=1`, `MOTOR_R_INVERT=0`) | `Config.h` |

## 2. Pista y pruebas

| ID | Dato | Estado |
|----|------|--------|
| P-01 | Dimensiones y material de la pista | 🔴 |
| P-02 | Colores reales de la superficie y de los obstáculos | 🟡 Colores de referencia calibrados; falta caracterizar la pista real |
| P-03 | Tipo/tamaño de obstáculos de cada nivel | 🔴 |
| P-04 | Iluminación del lugar de pruebas | 🟡 |

## 3. Decisiones de ingeniería

| ID | Decisión | Valor actual | Alternativa |
|----|----------|--------------|-------------|
| D-01 | Batería | **3S Li-ion** (elegido) | 2S (más barato/ligero) |
| D-02 | Sensor de obstáculos | **HC-SR04** | VL53L0X (I²C) |
| D-03 | Transporte | **WiFi + WebSocket** | BLE / ESP-NOW |
| D-04 | JARVIS | **Por reglas** (coste 0) | LLM externo (capa gratuita) |
| D-05 | Ángulo de esquiva | 45° (propuesto) | Calibrar |
| D-06 | Distancia de detección | 25 cm (propuesto) | Calibrar |
| D-07 | Odometría con encoders | **No usar** (decisión 2026-11-07) | Encoders para odometría/velocidad cerrada |

## 4. Verificación

> **Prueba funcional del 2026-11-24 (reportada por el autor):** funcionaron todos
> los sensores, la comunicación, el control por voz, JARVIS y los tres submodos autónomos; «prácticamente
> todo». Sin log archivado.

| ID | Qué | Cómo |
|----|-----|------|
| V-01 | Que el firmware **compile** | `arduino-cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi --warnings all firmware\esp32s3_robot` y `... firmware\tt_motor_test` ✅ **PASADA** |
| V-02 | Escáner I²C detecta `0x0D` y `0x29` | ✅ **FUNCIONA** (2026-11-24): ambos sensores I²C operan en el robot. El 2026-11-09 `0x0D` no respondía |
| V-03 | Medir PPR del encoder | 🟢 OPCIONAL: solo si se añade odometría (H-01); girar el eje a mano y contar pulsos por vuelta |
| V-04 | Calibrar la brújula | 🟡 La brújula funciona (2026-11-24); sin registro de calibración. Procedimiento hard/soft-iron (`Compass::setHardIron/setSoftIron`) |
| V-05 | Umbrales de color | ✅ **PASADA**: 450 muestras, 100 % de aciertos (`color_2026-11-23_1329.csv`). La luz ambiente alteraba las lecturas; se puso cinta aislante en el borde y se acercó el sensor al suelo |
| V-06 | Rumbo correcto según montaje | 🟡 Sin registro de error frente a ángulos conocidos; `QMC_MOUNT_OFFSET_DEG` y `QMC_DECLINATION_DEG` siguen en 0 |
| V-07 | Motores TT y TB6612 | ✅ **PASADA** (2026-11-07, T-Motor-01): cargar `firmware/tt_motor_test` y registrar resultados |
| V-08 | Control manual por serie en firmware principal | ✅ **PASADA en v0.2.0** (2026-11-07, T-Manual-00); por la app, comunicación funcional el 2026-11-24. Revalidación por serie sin registrar |
| V-09 | Servidor WiFi/WebSocket en placa | ✅ **FUNCIONA** (2026-11-24): comunicación real entre la app y el robot. Sin log archivado ni latencia medida |
| V-10 | 3 HC-SR04: ecos y diafonía | ✅ **FUNCIONA** (2026-11-24): los 3 sensores; desfase ≈2 mm en distancias cortas (pie de rey) y ≈2 cm a más de 20 cm (metro) |

## 5. Resumen: qué falta para cerrar el proyecto

Hecho: motores (T-Motor-01), color (T-Color-01) y, el 2026-11-24, todos los
sensores, la comunicación con la app, la voz, JARVIS y los **tres submodos autónomos**.

1. Confirmar y registrar el pulsador de emergencia (T-Estop-01) y el corte por
   pérdida de WiFi (deadman de 500 ms en manual).
2. Mejorar la búsqueda de línea: se perdió en 16 de 20 pruebas en curva (80 %): reconoce el color, pero al buscar gira más rápido de lo que el sensor tarda en leer (120 ms).
3. Reducir la velocidad de búsqueda o agregar sensores de color.
4. Medir las cotas del chasis (H-02) y caracterizar la pista (P-01 a P-04).
5. Guardar evidencias (log, foto o video) y anotarlas en §4.

Limitaciones conocidas: perder el WiFi **no detiene** el modo autónomo, y el
comando `calib` no está implementado.
