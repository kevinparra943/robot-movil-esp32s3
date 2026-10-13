# Requisitos del sistema

> Fuente: enunciado del estudiante (confirmado). Los RF-01â€¦RF-09 provienen del
> enunciado. Los RNF se derivan de las restricciones de seguridad y calidad.
> Estado: `CONFIRMADO` Â· `PROPUESTO` (decisiÃ³n de diseÃ±o) Â· `PENDIENTE` (falta dato).

---

## 1. Requisitos funcionales (RF)

| ID | Requisito | Estado |
|----|-----------|--------|
| RF-01 | **Control manual**: ejecutar avance, retroceso, giros y detenciÃ³n desde la app. | CONFIRMADO |
| RF-02 | **Comandos de voz**: control por voz reconocida fuera del MCU y enviada como comando estructurado. Gestiona Ã³rdenes invÃ¡lidas, contradictorias, pÃ©rdida de conexiÃ³n y parada de emergencia. | CONFIRMADO |
| RF-03 | **Control en la ESP32-S3**: firmware que gestiona actuadores, sensores, estados, comunicaciÃ³n y telemetrÃ­a. Manual y autÃ³nomo **mutuamente excluyentes** (FSM). | CONFIRMADO |
| RF-04 | **BrÃºjula digital**: conocer y mostrar rumbo actual y deseado en grados. Error angular normalizado a (âˆ’180Â°, 180Â°]. CalibraciÃ³n, detecciÃ³n de lecturas invÃ¡lidas y anÃ¡lisis de interferencia. | CONFIRMADO |
| RF-05 | **DetecciÃ³n de colores**: reconocer negro, blanco, rojo, amarillo, verde y azul. MÃ³dulo independiente, con calibraciÃ³n de umbrales. | CONFIRMADO |
| RF-06 | **DetecciÃ³n y evasiÃ³n de obstÃ¡culos**: FSM con navegaciÃ³n normal, detecciÃ³n, parada segura, maniobra, verificaciÃ³n de paso libre, reanudaciÃ³n y estado de error. | CONFIRMADO |
| RF-07 | **ComunicaciÃ³n inalÃ¡mbrica**: intercambio de comandos y telemetrÃ­a. Protocolo **versionado**, con validaciÃ³n y manejo de errores. Comandos con **caducidad/watchdog**. | CONFIRMADO |
| RF-08 | **App mÃ³vil o web**: modo, comandos, voz, rumbo, conexiÃ³n, color, distancia, estado de motores y variables en tiempo real. | CONFIRMADO |
| RF-09 | **Chatbot JARVIS**: explica el proyecto y el significado de las variables desde documentaciÃ³n + telemetrÃ­a real. No inventa mediciones ni ejecuta comandos crÃ­ticos sin validaciÃ³n. | CONFIRMADO |

### Niveles de dificultad (RF-06/RF-05)

| Nivel | ObstÃ¡culos mÃ­nimos | Colores |
|-------|-------------------:|---------|
| 1 | 4 | 3 |
| 2 | 6 | 4 |
| 3 | 8 | 6 |

---

## 2. Requisitos no funcionales (RNF)

| ID | Requisito | Estado |
|----|-----------|--------|
| RNF-01 | **Seguridad**: parada de emergencia (botÃ³n + software). Estado seguro de motores en arranque, reinicio, bloqueo y pÃ©rdida de enlace. | CONFIRMADO |
| RNF-02 | **No bloqueo**: sin esperas bloqueantes prolongadas; temporizaciÃ³n no bloqueante (`millis()`). | CONFIRMADO |
| RNF-03 | **Modularidad**: un mÃ³dulo por subsistema; sin lÃ³gica centralizada en un Ãºnico archivo. | CONFIRMADO |
| RNF-04 | **Trazabilidad**: cada requisito enlaza mÃ³dulo y prueba. | CONFIRMADO |
| RNF-05 | **Protocolo versionado** y `Config.h` como Ãºnica fuente de constantes. | CONFIRMADO |
| RNF-06 | **Secretos**: ninguna credencial en el repositorio. | CONFIRMADO |
| RNF-07 | **Entorno Ãºnico** (Arduino C++); no migrar sin documentar el impacto. | PROPUESTO |
| RNF-08 | **Presupuesto limitado**: priorizar mejor relaciÃ³n calidad/precio. | CONFIRMADO |

---

## 3. Restricciones de hardware (confirmadas)

- MCU: **ESP32-S3**, sin Bluetooth Classic (solo BLE).
- Motores: 6 V mÃ¡x, 0,2 A nominal, 1,2 A bloqueo, encoder 3,3â€“5 V.
- AlimentaciÃ³n: banco **Li-ion 3S** â†’ obliga a buck a 6 V (motores) y 5 V (lÃ³gica).
- Nunca conectar motores a GPIO. GND comÃºn obligatorio.
- GPIO no usables: strapping (0, 3, 45, 46), USB (19, 20), flash/PSRAM (26â€“37).