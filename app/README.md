# Aplicación de control (app)

> **Estado (2026-11-24):** la comunicación con el robot, el control por voz y
> JARVIS funcionaron en el robot real (reportado por el autor).

Interfaz web de control y monitorización del robot (RF-08). Es una **página web
propia (HTML/JS)**, que Streamlit también incrusta (`streamlit/app.py`) y que habla con la ESP32-S3 por **WebSocket**
usando el **protocolo JSON v1**.

## Estructura

| Archivo | Responsabilidad |
|---------|-----------------|
| `shared/protocol.js` | Protocolo v1 (parseo/validación/construcción). Lógica pura. |
| `shared/commands.js` | Mapeo voz/texto → comando (RF-02). Lógica pura. |
| `shared/jarvis.js` | Asistente por reglas (RF-09). Lógica pura: respuestas, pregunta u orden (`isQuestion`), confirmaciones y texto para voz. |
| `shared/jarvis_kb.js` | Base de conocimiento técnica de JARVIS (alimentación, pines, I²C, PWM, timers, interrupciones, sensores, WiFi, protocolo, seguridad, navegación). La comparten la web y Streamlit (`jarvis.py` lee el JSON entre los marcadores `KB-JSON`). Actualizar si cambia `Config.h`. |
| `shared/jarvis_voice.js` | Voz de JARVIS en el navegador (síntesis en español, troceada por frases). |
| `shared/auto_panel.js` | Panel para elegir el submodo autónomo (solo esquivar, rumbo, línea). |
| `web/index.html` | Interfaz: conexión, modos, control manual, voz, telemetría, JARVIS, historial. |
| `web/app.js` | WebSocket, deadman, voz (Web Speech API), render y **modo simulación**. |
| `web/style.css` | Estilos: tokens de diseño (color, espaciado, movimiento), componentes y responsive. |
| `web/fonts/` | IBM Plex Sans/Mono locales (OFL), sin dependencias de red. |

> `web/v2/` es una variante experimental que **no** sirve `serve.py`; la
> interfaz activa es `web/index.html`.

### Convenciones de la interfaz

- **Estado del enlace**: verde = robot conectado, azul + insignia `SIM` =
  simulación (nunca se confunde con una conexión física), ámbar = conectando.
- **Sin enlace no hay datos**: al desconectar, todos los instrumentos vuelven
  a "sin dato". El estado de E-stop se conserva como *último estado conocido*.
- **Controles**: el D-pad se deshabilita con un motivo visible (sin enlace,
  E-stop activa, modo autónomo). *Detener* y la parada de emergencia nunca se
  deshabilitan.
- **Animaciones**: solo CSS, sin retardar comandos; respetan
  `prefers-reduced-motion`.

Los tres módulos de `shared/` son **UMD**: funcionan en el navegador y en Node
(por eso se prueban con `tests/host/test_*.js`). `protocol.js` valida en **ambas
direcciones**: comandos `cliente → robot` y mensajes `robot → cliente`
(`telemetry`, `ack`, `event`, `error`, `hello_ack`, `pong`).

## Ejecutar

```powershell
python app\serve.py
# abrir http://localhost:8000/web/index.html
```

`serve.py` sirve la carpeta `app/` y abre la interfaz en `localhost`, que es un
contexto seguro para la Web Speech API. Opciones: `--port 8080` y
`--host 0.0.0.0` (esta última desactiva la voz en navegadores que exigen HTTPS).

- **Voz**: la Web Speech API exige contexto seguro (`localhost` o HTTPS). En Chrome suele requerir internet; si el PC está conectado al WiFi AP del robot (`robot-esp32s3`) no habrá internet y el reconocimiento puede fallar con `network`. Usa localhost con internet disponible, o conecta el robot/PC a una red con internet cuando pruebes voz.
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
python tests\host\run_all.py
```
