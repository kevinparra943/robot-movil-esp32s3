# Análisis de riesgos

Escala: Probabilidad (P) y Severidad (S) de 1 (baja) a 5 (alta).
Prioridad = P × S.

| ID | Riesgo | P | S | Prior. | Mitigación | Estado |
|----|--------|---|---|-------:|------------|--------|
| R-01 | Clasificación de **6 colores** poco fiable con luz variable | 4 | 4 | 16 | TCS34725 (RGB+Clear+LED); calibrar umbrales con muestras reales; documentar límite si no separa | Abierto |
| R-02 | **Interferencia magnética** de motores/cables sobre la brújula | 4 | 5 | 20 | Montar la brújula lejos de corrientes; calibración hard/soft-iron; filtro y rechazo de lecturas inválidas | Abierto |
| R-03 | **Pérdida de enlace** → el robot sigue avanzando | 3 | 5 | 15 | Watchdog/deadman de comandos (TTL 500 ms) + SAFE | Abierto |
| R-04 | **HC-SR04** no detecta superficies blandas/oblicuas o lleva a eco falso | 3 | 3 | 9 | Filtro de mediana; margen de distancia; ángulo de montaje; considerar VL53L0X | Abierto |
| R-05 | **ECHO a 5 V daña el GPIO** del S3 | 2 | 5 | 10 | Divisor 1 kΩ/2 kΩ a 3.3 V; verificar con multímetro antes de conectar | Abierto |
| R-06 | Alimentación Li-ion **3S**: sobre/descarga, mal contacto | 3 | 5 | 15 | BMS obligatorio, fusible, interruptor; carga supervisada; nunca dejar sin vigilancia | Abierto |
| R-07 | **Ruido eléctrico** de motores reinicia el MCU o corrompe I²C | 4 | 3 | 12 | Desacoplo (1000 µF en VM, 100 nF por sensor); rieles separados; cables cortos | Abierto |
| R-08 | Firmware con esperas bloqueantes pierde eventos | 3 | 3 | 9 | Temporización no bloqueante; revisión de código (sin `delay` largo) | Abierto |
| R-09 | TB6612 al límite con **bloqueo simultáneo** de 2 motores (2.4 A) | 2 | 4 | 8 | No forzar bloqueo; STBY para corte; considerar disipación térmica | Abierto |
| R-10 | La **pista sin definir** retrasa las pruebas de niveles | 4 | 2 | 8 | Definir dimensiones/material; pruebas progresivas por nivel | Abierto |
| R-11 | Web Speech API no funciona servida por la placa (HTTP plano) | 3 | 2 | 6 | Servir la app desde `localhost`/HTTPS; dejar botones como respaldo | Abierto |
| R-12 | Clave de API del LLM filtrada al repo | 2 | 4 | 8 | `.env` ignorado; nunca en el repo; revisar `.gitignore` | Mitigado |

## Riesgos críticos (prioridad ≥ 15)

1. **R-02 (20)** — brújula e interferencia electromagnética. Es el de mayor
   prioridad: sin brújula fiable no hay control de rumbo ni navegación.
   Mitigación de diseño: alimentar motores por riel separado, montar la brújula
   en el punto más alejado de los motores y del cableado de potencia.
2. **R-01 (16)** — detección de color. Decidir pronto si el TCS34725 separa los
   6 colores; si no, documentarlo como limitación y plantear alternativa.
3. **R-03 (15)** — pérdida de enlace. El deadman no es opcional.
4. **R-06 (15)** — seguridad de la batería Li-ion.
