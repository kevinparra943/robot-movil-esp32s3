# Máquina de estados

## 1. FSM global (modos y seguridad)

```
            ┌────────┐
            │  BOOT  │  arranque: motores en SAFE
            └───┬────┘
                ▼
            ┌────────┐   hello + handshake
            │  IDLE  │◄─────────────────────────────┐
            └─┬────┬─┘                              │
      mode=manual│  │mode=autonomo                  │ stop / reset
               ▼    ▼                               │
         ┌────────┐ ┌───────────┐                   │
         │ MANUAL │ │ AUTONOMO  │───────────────────┘
         └───┬────┘ └─────┬─────┘
             │            │
             └─────┬──────┘
                   ▼  estop / fallo / watchdog
              ┌──────────┐
              │   SAFE   │  motores detenidos (STBY=0)
              └────┬─────┘
                   ▼ rearmar (comando explícito)
              ┌──────────┐
              │  ERROR   │  fallo persistente (sensor/link)
              └──────────┘
```

Reglas:

- **MANUAL y AUTONOMO son mutuamente excluyentes** (RF-03). Cambiar de modo
  siempre pasa por IDLE/SAFE.
- `SAFE` se puede activar desde cualquier estado (botón o `estop`) y **tiene
  prioridad absoluta** (RNF-01).
- `ERROR` es un estado con causa registrada; requiere rearme explícito.

> Implementación actual (v0.4.0-nav): `FSMGlobal` implementa
> `BOOT/IDLE/MANUAL/AUTONOMO/SAFE/ERROR`; `setAutonomo()` desarma y `estop()`
> queda enclavado hasta reiniciar. La transición de rearme de `SAFE` a `IDLE`
> todavía no existe. Por WebSocket, `drive stop` detiene los motores pero no
> desarma el driver; el desarme ocurre por `STOP`/`DISARM` serie, deadman o
> `estop`.

## 2. FSM de navegación autónoma (RF-06)

```
   ┌────────────────┐
   │ NAVEGACION_    │◄──────────────────────────────┐
   │ NORMAL         │                               │
   └───────┬────────┘                               │
           │ obstáculo < UMBRAL                      │
           ▼                                         │
   ┌────────────────┐                                │
   │ DETECCION      │                                │
   └───────┬────────┘                                │
           ▼                                         │
   ┌────────────────┐   ya libre                     │
   │ PARADA_SEGURA  │──────────────┐                 │
   └───────┬────────┘              │                 │
           ▼                       ▼                 │
   ┌────────────────┐      ┌──────────────┐          │
   │ MANIOBRA       │      │ VERIF. LIBRE │──── paso libre ──┘
   │ (giro/esquiva) │      └──────┬───────┘
   └───────┬────────┘             │ sigue bloqueado
           │                      ▼
           │               ┌──────────────┐
           └──────────────►│ ERROR/BLOQUEO │ (intervención)
                           └──────────────┘
```

Estados mínimos exigidos por RF-06, todos presentes:
navegación normal, detección de obstáculo, parada segura, selección y
ejecución de maniobra, verificación de paso libre, reanudación y error/bloqueo.

### 2.1 Implementación (v0.4.0-nav): `Navigator`

`firmware/esp32s3_robot/Navigator.cpp` implementa la FSM anterior con estos
estados (se publican en la telemetría `nav.state` y en el evento `NAV_STATE`):

Al entrar en AUTONOMO el usuario elige un **submodo** (`mode.strategy`); sin él
el robot no arranca:

| Submodo | Comportamiento | Tras rodear un obstáculo |
|---------|----------------|--------------------------|
| `evadir` | Avanza recto. Ignora rumbo y línea. | `NAVEGAR` (recto) |
| `rumbo` | Control P hacia el rumbo. Sin brújula válida avanza y esquiva hasta recuperarla. | `REORIENTAR` |
| `linea` | Sigue cualquier color menos blanco. Ignora el rumbo. | `VOLVER` → `ALINEAR` |

| Estado | Equivale a | Acción |
|--------|-----------|--------|
| `NAVEGAR` | navegación normal | Submodo rumbo con brújula válida: control P (`NAV_KP`) sobre el error angular; si el error supera `NAV_ALIGN_DEG`, gira en sitio. Submodo evadir: recto. Submodo línea: **sigue el borde de la línea** pivotando (rueda interior quieta): sobre color se aleja rápido (`LINE_FOLLOW_SPEED` = 70 %), sobre blanco vuelve más despacio (`LINE_RETURN_SPEED` = 55 %) para no cruzar la cinta entre dos lecturas del sensor; tolera blanco hasta `LINE_LOST_MS`. Las velocidades quedan por encima de la zona muerta de los TT (~30–35 % en el suelo). |
| `EVADIR` | detección + parada + maniobra | Obstáculo frontal: gira en sitio hacia el lado libre o con más espacio hasta despejar el frente y `NAV_EVADE_EXTRA_MS` más (máximo `NAV_EVADE_MAX_MS`). |
| `BORDEAR` | verificación de paso libre | Avanza mientras el sensor lateral ve el obstáculo, y `NAV_BYPASS_MS` más tras perderlo. |
| `REORIENTAR` | reanudación | Gira hacia el rumbo deseado hasta `|error| ≤ NAV_REALIGN_OK_DEG` y vuelve a `NAVEGAR`. **Así sigue el trayecto.** |
| `BUSCAR_LINEA` | reanudación (modo línea) | Línea perdida: vaivén pivotando sobre la rueda izquierda (la derecha a `LINE_SEARCH_SPEED` adelante/atrás) con amplitud creciente (`LINE_SWEEP_MS` × 1, 2, 3…), empezando por el lado donde la vio por última vez; al encontrarla recuerda ese lado y sigue sin frenar. |
| `RETROCEDER` | bloqueo | Los tres sensores bloqueados, o `EVADIR` sin éxito: retrocede `NAV_BACK_MS` y vuelve a decidir. |
| `VOLVER` | reanudación (modo línea) | Arco por pulsos hacia el lado donde quedó la línea; máximo `NAV_RETURN_MAX_MS`, después `BUSCAR_LINEA`. |
| `ALINEAR` | reanudación (modo línea) | Al tocar la línea pivota alejándose del obstáculo hasta volver a verla (máximo `NAV_LINE_ALIGN_MS`). |

La lógica está replicada en `tests/host/test_navigator.py` (pruebas T-Nav-01/02).

## 3. Parámetros a calibrar (valores `PROPUESTOS`, a medir en placa)

| Parámetro | Valor propuesto | Dónde |
|-----------|-----------------|-------|
| Distancia de detección | 25 cm | `Config.h` |
| Distancia de parada segura | 15 cm | `Config.h` |
| Tiempo de maniobra | 700 ms | `Config.h` |
| Ángulo de esquiva | 45° | `Config.h` |
| Reintentos antes de ERROR | 3 | `Config.h` |
| TTL de comando de movimiento | 500 ms | `Config.h` |

> El robot funcionó el 2026-11-24, pero no hay mediciones que respalden estos
> números: siguen siendo `PROPUESTOS` hasta registrarlas.
