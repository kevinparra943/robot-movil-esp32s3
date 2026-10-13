# Aplicación de control (app)

Interfaz web de control y monitorización del robot (RF-08). Es una **página web
propia (HTML/JS)**, sin Streamlit, que habla con la ESP32-S3 por **WebSocket**
usando el **protocolo JSON v1**.

## Estructura

| Archivo | Responsabilidad |
|---------|-----------------|
| `shared/protocol.js` | Protocolo v1 (parseo/validación/construcción). Lógica pura. |
| `shared/commands.js` | Mapeo voz/texto → comando (RF-02). Lógica pura. |
| `shared/jarvis.js` | Asistente por reglas (RF-09). Lógica pura. |
| `web/index.html` | Interfaz: conexión, modos, control manual, voz, telemetría, JARVIS, historial. |
| `web/app.js` | WebSocket, deadman, voz (Web Speech API), render y **modo simulación**. |
| `web/style.css` | Estilos. |

Los tres módulos de `shared/` son **UMD**: funcionan en el navegador y en Node
(por eso se prueban con `tests/host/test_*.js`).

## Ejecutar

```powershell
```

- **Voz**: la Web Speech API exige contexto seguro. Servir desde `localhost`
  y quedan los botones de control.
- **Sin robot**: marca **Modo simulación** en la interfaz para probar todo con
  telemetría sintética.

## Conexión con el robot

- La página se conecta a `ws://<IP-del-robot>:<puerto>` (configurable en la UI).
- Al conectar envía `hello`; el robot responde `hello_ack`.
- Comandos con **deadman**: el control manual reenvía el comando de movimiento
  cada 200 ms; si se suelta el botón (o se pierde el enlace), se envía `stop`.

## Pruebas

La lógica de `shared/` y la integración WebSocket se prueban sin navegador ni
robot:

```powershell
```
