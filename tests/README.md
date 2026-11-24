# Pruebas

Dos familias, separadas a propósito:

| Carpeta | Qué prueba | Requiere |
|---------|------------|----------|
| `host/` | Funciones puras (ángulos, color, distancia, protocolo, voz→comando, JARVIS) e integración WebSocket | Python y/o Node, en el PC |
| *(futuro)* `board/` | Comportamiento en la placa real | ESP32-S3 y hardware |

## tests/host

Pruebas que corren **sin placa** ni navegador. Deben pasar siempre antes de
cargar firmware.

```powershell
python tests\host\run_all.py
```

- Las pruebas **`.py`** se ejecutan en un subproceso de Python.
- Las pruebas **`.js`** se ejecutan con `node` (si está en el PATH; si no, se
  omiten y se informa).

| Prueba | Tipo | Cubre |
|--------|------|-------|
| `test_heading.py` | Python | Normalización del error angular (RF-04) |
| `test_color.py` | Python | Clasificación de los 6 colores (RF-05) |
| `test_obstacle.py` | Python | Conversión, umbrales y configuración escalonada de 3 HC-SR04 (RF-06) |
| `test_navigator.py` | Python | Navegador autónomo y sus tres submodos (RF-04, RF-06) |
| `test_streamlit_logic.py` | Python | Voz y JARVIS del panel Streamlit (RF-08, RF-09) |
| `test_protocol.js` | Node | Protocolo v1 en ambas direcciones (RF-07) |
| `test_commands.js` | Node | Voz/texto → comando (RF-02) |
| `test_jarvis.js` | Node | JARVIS por reglas (RF-09) |
| `test_ws_integration.js` | Node | Integración WS extremo a extremo + deadman (RF-07) |

`mock_robot_server.js` es un **ESP32-S3 simulado** (WebSocket mínimo, sin
dependencias) que usa `test_ws_integration.js`.

Regla del proyecto: **no se declara superada ninguna prueba sin evidencia real**
(salida de la prueba o captura). Ver `docs/trazabilidad.md`.
