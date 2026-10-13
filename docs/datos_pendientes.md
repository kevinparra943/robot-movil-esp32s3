# Datos pendientes y decisiones por tomar

> Cada punto indica **dónde** se cambia, para que ninguna decisión quede
> enterrada en el firmware.

Estado: `🔴 BLOQUEANTE` impide avanzar · `🟡 IMPORTANTE` afecta al resultado ·
`🟢 MENOR` mejora.

## 1. Hardware

| ID | Dato | Estado | Dónde se cambia |
|----|------|--------|-----------------|
| H-01 | **Pulsos por revolución** del encoder del motor TT | 🔴 | `Config.h` → `ENCODER_PPR` (medir a mano) |
| H-02 | Chasis fabricado: cotas, separación de ruedas, punto del caster | 🔴 | `Config.h` → `WHEEL_BASE_MM`, `WHEEL_DIAMETER_MM` |
| H-03 | Rueda de 6.5 cm: confirmar diámetro real y diámetro del eje | 🟡 | `Config.h` → `WHEEL_DIAMETER_MM` |
| H-04 | Divisor de ECHO del HC-SR04: valores reales | 🟡 | `hardware/pinout.md` §3 |
| H-05 | Confirmar que los GPIO propuestos existen/libres en la placa | 🟡 | `hardware/pinout.md` |
| H-06 | Estado real de STBY del TB6612 en placa (seguro) | 🟡 | `MotorDriver.cpp` |

## 2. Pista y pruebas

| ID | Dato | Estado |
|----|------|--------|
| P-01 | Dimensiones y material de la pista | 🔴 |
| P-02 | Colores reales de la superficie y de los obstáculos | 🔴 |
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

## 4. Verificación pendiente

| ID | Qué | Cómo |
|----|-----|------|
| V-01 | Que el firmware **compile** | `arduino-cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi --warnings all` ✅ **PASADA (v0.2.0)** |
| V-02 | Escáner I²C detecta `0x0D` y `0x29` | cargar el firmware y ver el monitor serie |
| V-03 | Medir PPR del encoder | girar el eje a mano y contar pulsos por vuelta (H-01) |
| V-04 | Calibrar la brújula | procedimiento hard/soft-iron (`Compass::setHardIron/setSoftIron`) |
| V-05 | Umbrales de color | muestras reales de los 6 colores (`Config.h`: `TCS_BLACK_CLEAR_MAX`, `TCS_WHITE_SAT_MAX`) |
| V-06 | Rumbo correcto según montaje | ajustar `QMC_MOUNT_OFFSET_DEG` y `QMC_DECLINATION_DEG` |

## 5. Resumen: qué falta para cerrar el proyecto

1. Comprar el hardware del BOM (`hardware/BOM.xlsx`).
2. Medir `ENCODER_PPR` y las cotas del chasis (H-01, H-02).
3. Compilar y cargar **T-00**; verificar escáner I²C (V-01, V-02).
4. Implementar y probar cada sensor por separado (Fase 4).
5. Integrar navegación y evasión (Fase 5).
6. Comunicaciones, voz y JARVIS (Fase 6).
7. Documentar resultados reales en el informe IEEE.
