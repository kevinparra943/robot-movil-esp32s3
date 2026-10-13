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

## 3. Parámetros a calibrar (valores `PROPUESTOS`, a medir en placa)

| Parámetro | Valor propuesto | Dónde |
|-----------|-----------------|-------|
| Distancia de detección | 25 cm | `Config.h` |
| Distancia de parada segura | 15 cm | `Config.h` |
| Tiempo de maniobra | 700 ms | `Config.h` |
| Ángulo de esquiva | 45° | `Config.h` |
| Reintentos antes de ERROR | 3 | `Config.h` |
| TTL de comando de movimiento | 500 ms | `Config.h` |

> Ninguno de estos números se da por bueno sin prueba en el robot real.
