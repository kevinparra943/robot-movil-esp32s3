# Arquitectura del sistema

## 1. Visión general

```
                 ┌──────────────── App web (navegador) ────────────────┐
                 │  manual · voz · rumbo · color · distancia · log     │
                 └───────────────▲───────────────┬─────────────────────┘
                                 │  telemetría   │  comandos (JSON v1)
                       WebSocket │               │ WebSocket
                 ┌───────────────┴───────────────▼─────────────────────┐
                 │                  ESP32-S3                            │
                 │  ┌────────────────────────────────────────────────┐  │
                 │  │                 FSMGlobal                       │  │
                 │  │   BOOT · IDLE · MANUAL · AUTONOMO · SAFE · ERROR│  │
                 │  └───┬───────────┬───────────────┬────────────────┘  │
                 │      │           │               │                   │
                 │  ControlManual  NavigationFSM   Safety              │
                 │      │           │  (evasión)     │                   │
                 │      └─────┬─────┴───────┬───────┘                   │
                 │            ▼             ▼                           │
                 │       MotorDriver    HeadingControl                  │
                 │        (TB6612)      (PI sobre error angular)        │
                 │            │             ▲                           │
                 │            ▼             │                           │
                 │        Motores         Compass (QMC5883L)            │
                 │                        ColorSensor (TCS34725)        │
                 │                        ObstacleSensor ×3 (HC-SR04)   │
                 │                        Encoders                       │
                 └──────────────────────────────────────────────────────┘
```

- La **FSMGlobal** es la única autoridad de movimiento: manual y autónomo son
  **mutuamente excluyentes** (RF-03).
- La **Safety** puede forzar `SAFE` desde cualquier estado (RNF-01).
- La **Telemetry** publica un snapshot periódico del estado real.

## 2. Módulos del firmware (un archivo por módulo)

| Módulo | Responsabilidad | Depende de |
|--------|-----------------|-----------|
| `Config.h` | Pines, versiones, constantes. Única fuente de verdad. | — |
| `Diagnostics` | Banner de arranque, escáner I²C, latido. | `Config`, `Wire` |
| `MotorDriver` | Control TB6612 (PWM+dir), estado seguro, límites. | `Config` |
| `Encoder` | Lectura de cuadratura, estimación de velocidad. | `Config` |
| `Compass` | Lectura y calibración QMC5883L, rumbo en grados. | `Config`, I²C |
| `ColorSensor` | Lectura TCS34725 y clasificación por umbrales. | `Config`, I²C |
| `ObstacleSensor` | 3× HC-SR04 no bloqueante: medición por interrupción y disparo escalonado. | `Config` |
| `ControlManual` | Traduce comandos manuales a acciones de motor. | `MotorDriver`, `Config` |
| `Navigator` | Piloto autónomo con tres submodos (evadir, rumbo, línea): control P de rumbo, evasión y seguimiento de línea. | `Geometry`, `Config` |
| `FSMGlobal` | Orquesta modos (BOOT/IDLE/MANUAL/AUTONOMO/SAFE/ERROR). | todos |
| `Protocol` | Serialización/validación de mensajes JSON v1. | — |
| `Wireless` | WiFi + WebSocket (servidor de telemetría/comandos). | `Protocol`, `Config` |
| `Telemetry` | Construye el snapshot de estado. | sensores, FSM |

**Estado de implementación (v0.4.0-nav):** existen todos los módulos de la tabla.
`Navigator` reúne el control de rumbo y la navegación, y la seguridad (E-stop
enclavado y deadman) está en `FSMGlobal`/`ControlManual`; no hay módulos
`HeadingControl`, `NavigationFSM` ni `Safety` separados. El encoder es opcional y
no se usa para el control. El 2026-11-24 funcionaron en el robot los sensores, la
comunicación con la app, la voz y JARVIS (ver [`trazabilidad.md`](trazabilidad.md)). Para validar el tren
de potencia de forma aislada se conserva `firmware/tt_motor_test/`.

## 3. Decisiones de diseño

### 3.1 Entorno: Arduino framework (C++) — PROPUESTO ✅

| Criterio | Arduino | ESP-IDF |
|---|---|---|
| Experiencia del autor | ✅ demostrada | 🟡 nueva |
| Bibliotecas de sensores | ✅ abundantes | 🟡 manual |
| WiFi/BLE/WebSocket | ✅ `WiFi.h`, NimBLE, WebSockets | ✅ fino |
| Depuración | 🟡 básica | ✅ JTAG/GDB |
| Flujo ya montado (`arduino-cli` + FQBN) | ✅ | ❌ |

**Consecuencia documentada:** BLE será NimBLE/Core-BLE (el S3 no tiene Classic).
Si se requiere control fino, se puede migrar a ESP-IDF o usar *Arduino-as-component*
como paso intermedio, **sin hacerlo a mitad del proyecto**.

### 3.2 Comunicación: WiFi + WebSocket (RF-07)

- **WiFi como arquitectura inicial**; BLE/ESP-NOW solo si hay justificación.
- Protocolo **JSON versionado** (ver `protocolo_comunicacion.md`).
- Los comandos de movimiento caducan (deadman) para que el robot no avance si
  se pierde la conexión.

### 3.3 App web (RF-08)

- Interfaz **HTML/JS** propia, servida también dentro de **Streamlit** (app principal).
- Telemetría por **WebSocket** hacia la ESP32-S3.
- **Voz** con Web Speech API: requiere contexto seguro → servir desde `localhost`
  o HTTPS. Si la página la sirve la propia placa por HTTP plano, la voz se
  desactiva y quedan los botones.

### 3.4 JARVIS (RF-09)

- **Fase 1 (coste 0):** asistente por **reglas/intenciones** que responde desde
  `docs/` + telemetría real. Sin internet ni claves.
- **Fase 2 (opcional):** LLM de capa gratuita. La clave vive en `.env`
  (ignorado por git). Nunca en el repo.

## 4. Diagrama de bloques de alimentación

```
  Batería 3S (11.1 V nom / 12.6 V llena)
     │
     ├──[BMS 3S]──[Interruptor + Fusible]──┬── Buck A → 6 V ── TB6612 (VM) → Motores
     │                                     │
     │                                     └── Buck B → 5 V ── ESP32-S3 (5V) → 3.3 V lógica
     └─────────────── GND común (batería = driver = MCU = sensores) ─────────────
```

Reglas: motores **nunca** desde GPIO ni desde el regulador del S3; desacoplo
(1000 µF junto a VM del driver, 100 nF junto a cada sensor); GND común.
