# Análisis de riesgos

Escala: Probabilidad (P) y Severidad (S) de 1 (baja) a 5 (alta).
Prioridad = P × S.

| ID | Riesgo | P | S | Prior. | Mitigación | Estado |
|----|--------|---|---|-------:|------------|--------|
| R-01 | Clasificación de **6 colores** poco fiable con luz variable o reflejos (cinta) | 4 | 4 | 16 | Sensor tapado contra la luz ambiente; clasificación por **tono** (inmune a cambios de brillo en rojo/amarillo/verde/azul); 450 muestras, 100 % de aciertos. Negro/blanco dependen del brillo: el negro tolera hasta 1,5× de reflejo. Repetir `tools/calibrar_color.py` en la pista real | Mitigado parcialmente |
| R-02 | **Interferencia magnética** de motores/cables sobre la brújula | 4 | 5 | 20 | Montar la brújula lejos de corrientes; calibración hard/soft-iron; filtro y rechazo de lecturas inválidas | Abierto (la brújula funciona, 2026-11-24; falta medir la interferencia con motores en marcha) |
| R-03 | **Pérdida de enlace** → el robot sigue avanzando | 3 | 5 | 15 | Watchdog/deadman de comandos (TTL 500 ms) + SAFE | Mitigado parcialmente (deadman en manual; el modo autónomo no se detiene al perder el WiFi) |
| R-04 | **3× HC-SR04** no detectan superficies blandas/oblicuas, dan eco falso o interfieren entre sí | 3 | 3 | 9 | Disparo escalonado de 30 ms y periodo de 90 ms; filtro de mediana; margen de distancia; considerar VL53L0X | Mitigado (desfase ≈2 mm en distancias cortas (pie de rey) y ≈2 cm a más de 20 cm (metro); falta medir diafonía) |
| R-05 | **ECHO a 5 V daña el GPIO** del S3 en cualquiera de los 3 sensores | 2 | 5 | 10 | Divisor 1 kΩ/2 kΩ por sensor a 3.3 V; verificar con multímetro antes de conectar | Abierto |
| R-06 | Alimentación Li-ion **3S**: sobre/descarga, mal contacto | 3 | 5 | 15 | BMS obligatorio, fusible, interruptor; carga supervisada; nunca dejar sin vigilancia | Abierto |
| R-07 | **Ruido eléctrico** de motores reinicia el MCU o corrompe I²C | 4 | 3 | 12 | Desacoplo (1000 µF en VM, 100 nF por sensor); rieles separados; cables cortos | Abierto |
| R-08 | Firmware con esperas bloqueantes pierde eventos | 3 | 3 | 9 | Temporización no bloqueante; revisión de código (sin `delay` largo) | Abierto |
| R-09 | TB6612 al límite con **bloqueo simultáneo** de 2 motores (2.4 A) | 2 | 4 | 8 | No forzar bloqueo; STBY para corte; considerar disipación térmica | Abierto |
| R-10 | La **pista sin definir** retrasa las pruebas de niveles | 4 | 2 | 8 | Definir dimensiones/material; pruebas progresivas por nivel | Abierto |
| R-11 | Web Speech API no funciona servida por la placa (HTTP plano) | 3 | 2 | 6 | Servir la app desde `localhost`/HTTPS; dejar botones como respaldo | Mitigado (voz probada con el robot, 2026-11-24) |
| R-12 | Clave de API del LLM filtrada al repo | 2 | 4 | 8 | `.env` ignorado; nunca en el repo; revisar `.gitignore` | Mitigado |

## Riesgos críticos (prioridad ≥ 15)

1. **R-02 (20)** — brújula e interferencia electromagnética. Es el de mayor
   prioridad: sin brújula fiable no hay control de rumbo ni navegación.
   Mitigación de diseño: alimentar motores por riel separado, montar la brújula
   en el punto más alejado de los motores y del cableado de potencia.
2. **R-01 (16)** — detección de color. Con 450 muestras, 100 % de aciertos y
   funcionando en el robot el 2026-11-24. Negro y blanco dependen del brillo:
   repetir la calibración en la pista real y documentar el límite.
3. **R-03 (15)** — pérdida de enlace. El deadman no es opcional.
4. **R-06 (15)** — seguridad de la batería Li-ion.
