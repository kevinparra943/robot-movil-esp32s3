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
```

- Las pruebas **`.py`** se ejecutan en el propio proceso de Python.
- Las pruebas **`.js`** se ejecutan con `node` (si está en el PATH; si no, se
  omiten y se informa).

| Prueba | Tipo | Cubre |
|--------|------|-------|
| `test_protocol.js` | Node | Protocolo v1: parseo/validación (RF-07) |
| `test_commands.js` | Node | Voz/texto → comando (RF-02) |
| `test_jarvis.js` | Node | JARVIS por reglas (RF-09) |
| `test_ws_integration.js` | Node | Integración WS extremo a extremo + deadman (RF-07) |

`mock_robot_server.js` es un **ESP32-S3 simulado** (WebSocket mínimo, sin
dependencias) que usa `test_ws_integration.js`.

Regla del proyecto: **no se declara superada ninguna prueba sin evidencia real**
(salida de la prueba o captura). Ver `docs/trazabilidad.md`.
