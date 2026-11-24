# Requisitos del sistema

> Fuente: enunciado del estudiante (confirmado). Los RF-01…RF-09 provienen del
> enunciado. Los RNF se derivan de las restricciones de seguridad y calidad.
> Estado: `CONFIRMADO` · `PROPUESTO` (decisión de diseño) · `PENDIENTE` (falta dato).

---

## 1. Requisitos funcionales (RF)

| ID | Requisito | Estado |
|----|-----------|--------|
| RF-01 | **Control manual**: ejecutar avance, retroceso, giros y detención desde la app. | CONFIRMADO |
| RF-02 | **Comandos de voz**: control por voz reconocida fuera del MCU y enviada como comando estructurado. Gestiona órdenes inválidas, contradictorias, pérdida de conexión y parada de emergencia. | CONFIRMADO |
| RF-03 | **Control en la ESP32-S3**: firmware que gestiona actuadores, sensores, estados, comunicación y telemetría. Manual y autónomo **mutuamente excluyentes** (FSM). | CONFIRMADO |
| RF-04 | **Brújula digital**: conocer y mostrar rumbo actual y deseado en grados; en modo autónomo el robot **se orienta** con control P hacia el rumbo deseado (`Navigator`). Error angular normalizado a (−180°, 180°]. Calibración, detección de lecturas inválidas y análisis de interferencia. | CONFIRMADO |
| RF-05 | **Detección de colores**: reconocer negro, blanco, rojo, amarillo, verde y azul. Módulo independiente, con calibración de umbrales. | CONFIRMADO |
| RF-06 | **Detección y evasión de obstáculos**: FSM con navegación normal, detección, parada segura, maniobra, verificación de paso libre, reanudación y estado de error. | CONFIRMADO |
| RF-07 | **Comunicación inalámbrica**: intercambio de comandos y telemetría. Protocolo **versionado**, con validación y manejo de errores. Comandos con **caducidad/watchdog**. | CONFIRMADO |
| RF-08 | **App móvil o web (Streamlit)**: modo, comandos, voz, rumbo en **gráfico polar** (actual y deseado), conexión, color, distancia, estado de motores y variables en tiempo real. Implementada en `app/streamlit/` (principal) y `app/web/` (alternativa HTML/JS). | CONFIRMADO |
| RF-09 | **Chatbot JARVIS**: explica el proyecto y el significado de las variables desde documentación + telemetría real. No inventa mediciones ni ejecuta comandos críticos sin validación. | CONFIRMADO |

### Niveles de dificultad (RF-06/RF-05)

| Nivel | Obstáculos mínimos | Colores |
|-------|-------------------:|---------|
| 1 | 4 | 3 |
| 2 | 6 | 4 |
| 3 | 8 | 6 |

---

## 2. Requisitos no funcionales (RNF)

| ID | Requisito | Estado |
|----|-----------|--------|
| RNF-01 | **Seguridad**: parada de emergencia (botón + software). Estado seguro de motores en arranque, reinicio, bloqueo y pérdida de enlace. | CONFIRMADO |
| RNF-02 | **No bloqueo**: sin esperas bloqueantes prolongadas; temporización no bloqueante (`millis()`). | CONFIRMADO |
| RNF-03 | **Modularidad**: un módulo por subsistema; sin lógica centralizada en un único archivo. | CONFIRMADO |
| RNF-04 | **Trazabilidad**: cada requisito enlaza módulo y prueba. | CONFIRMADO |
| RNF-05 | **Protocolo versionado** y `Config.h` como única fuente de constantes. | CONFIRMADO |
| RNF-06 | **Secretos**: ninguna credencial en el repositorio. | CONFIRMADO |
| RNF-07 | **Entorno único** (Arduino C++); no migrar sin documentar el impacto. | PROPUESTO |
| RNF-08 | **Presupuesto limitado**: priorizar mejor relación calidad/precio. | CONFIRMADO |

---

## 3. Restricciones de hardware (confirmadas)

- MCU: **ESP32-S3**, sin Bluetooth Classic (solo BLE).
- Motores: 6 V máx, 0,2 A nominal, 1,2 A bloqueo, encoder 3,3–5 V.
- Alimentación: banco **Li-ion 3S** → obliga a buck a 6 V (motores) y 5 V (lógica).
- Nunca conectar motores a GPIO. GND común obligatorio.
- GPIO no usables: strapping (0, 3, 45, 46), USB (19, 20), flash/PSRAM (26–37).