#!/usr/bin/env python3
"""Pruebas de la logica de la app Streamlit (RF-02, RF-09) sin red ni navegador.

- voice_commands.from_text: mismo comportamiento que app/shared/commands.js
  y la orden nueva "rumbo N".
- jarvis.answer: usa la telemetria real y no inventa datos ausentes.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "app" / "streamlit"))

import jarvis  # noqa: E402
import voice_commands as vc  # noqa: E402


def check(name: str, cond: bool) -> None:
    print(f"[{'OK  ' if cond else 'FALLA'}] {name}")
    if not cond:
        raise AssertionError(name)


TELEMETRY = {
    "t": "telemetry", "v": 1, "mode": "autonomo",
    "heading": {"valid": True, "actual": 80.0, "target": 90.0, "error": 10.0},
    "color": {"name": "rojo", "valid": True, "rgb": [200, 30, 30]},
    "obstacle": {"valid": True, "distance_cm": 12.5, "blocked": True},
    "obstacle_left": {"valid": False, "distance_cm": None, "blocked": False},
    "obstacle_right": {"valid": True, "distance_cm": 40.0, "blocked": False},
    "motors": {"left": 40, "right": -40, "state": "moving"},
    "nav": {"state": "EVADIR", "level": 1},
    "estop": False,
}


def main() -> None:
    print("== Pruebas de la app Streamlit (voz + JARVIS) ==")

    c = vc.from_text("Adelante rápido")
    check("'adelante rapido' -> drive fwd 85", c["t"] == "drive" and c["dir"] == "fwd" and c["speed"] == 85)
    c = vc.from_text("gira a la izquierda 2 segundos")
    check("izquierda 2 s -> left, max_ms 2000", c["dir"] == "left" and c["_voice"]["max_ms"] == 2000)
    check("'parada de emergencia' -> estop", vc.from_text("¡Parada de emergencia!")["t"] == "estop")
    check("'detente' -> drive stop", vc.from_text("detente")["dir"] == "stop")
    check("'modo autónomo' -> mode autonomo", vc.from_text("modo autónomo")["value"] == "autonomo")
    c = vc.from_text("rumbo 270 grados")
    check("'rumbo 270 grados' -> heading 270", c["t"] == "heading" and c["deg"] == 270.0)
    check("'rumbo norte' -> heading 0", vc.from_text("rumbo norte")["deg"] == 0.0)
    c = vc.from_text("avanza hasta el obstaculo a 15 cm")
    check("avanza hasta obstaculo 15 cm", c.get("until") == "front_obstacle" and c["stop_cm"] == 15)
    c = vc.from_text("avanza")
    check("'avanza' -> hasta obstaculo 10 cm, 15 s", c.get("until") == "front_obstacle" and c["stop_cm"] == 10 and c["max_ms"] == 15000)
    c = vc.from_text("avanza a cinco centímetros durante ocho segundos")
    check("numeros en letras (cm y s)", c["stop_cm"] == 5 and c["max_ms"] == 8000)
    c = vc.from_text("retrocede un segundo")
    check("'un segundo' -> 1000", c["dir"] == "back" and c["_voice"]["max_ms"] == 1000)
    check("treinta y cinco por ciento -> 35", vc.from_text("avanza al treinta y cinco por ciento")["speed"] == 35)
    check("negacion 'no avances' -> None", vc.from_text("no avances") is None)
    check("texto sin sentido -> None", vc.from_text("banana") is None)
    check("wire() quita metadatos", "_voice" not in vc.wire(vc.from_text("adelante")))

    r = jarvis.answer("dame el estado", TELEMETRY, True)
    check("estado incluye rumbo, color, nav y distancias",
          all(x in r for x in ("80.0", "90.0", "rojo", "EVADIR", "12.5 cm", "izquierdo sin eco")))
    r = jarvis.answer("cual es el rumbo", TELEMETRY)
    check("rumbo: error positivo -> girar a la derecha", "derecha" in r and "10.0" in r)
    r = jarvis.answer("que color hay", {"color": {"valid": False}})
    check("color invalido: no inventa", "No tengo" in r)
    r = jarvis.answer("dame el estado", None)
    check("estado sin telemetria: lo dice", "no recibo" in r.lower())
    check("explica grafico polar", "polar" in jarvis.answer("que muestra el grafico polar", TELEMETRY).lower())
    check("conexion False", "NO" in jarvis.answer("estas conectado", TELEMETRY, False))

    # Base tecnica compartida con la app web (app/shared/jarvis_kb.js)
    check("KB cargada desde jarvis_kb.js", len(jarvis.KB.get("topics", [])) >= 15)
    check("tecnica: divisor del ECHO", "1 kΩ" in jarvis.answer("para que sirve el divisor del ultrasonido", None))
    check("tecnica: PWM 20 kHz", "audible" in jarvis.answer("por que el pwm es de 20 khz", None))
    check("tecnica: timers", "millis" in jarvis.answer("que timers usa el robot", None))
    check("tecnica: deadman", "500 ms" in jarvis.answer("como funciona el deadman", None))
    check("tecnica: alimentacion", "3S" in jarvis.answer("como se alimenta el robot", None))
    check("rumbo actual sigue en vivo", "80.0" in jarvis.answer("cual es el rumbo actual", TELEMETRY))

    # Boton "Hablar": pregunta -> JARVIS, orden -> robot
    for q in ("¿qué es el PWM?", "como funciona el modo autonomo", "jarvis que es el proyecto", "hola jarvis"):
        check(f"pregunta: {q}", jarvis.is_question(q))
    for q in ("avanza", "detente", "modo autonomo", "parada de emergencia", "jarvis avanza"):
        check(f"orden: {q}", not jarvis.is_question(q) and vc.from_text(jarvis.strip_wake(q)) is not None)
    for txt, strat, deg in (("sigue la línea", "linea", None), ("esquiva obstáculos", "evadir", None),
                            ("modo autónomo rumbo 90", "rumbo", 90), ("modo autónomo", None, None),
                            ("esquivar obstáculos con un rumbo de ciento veinte", "rumbo", 120)):
        c = vc.from_text(txt)
        check(f"auto: {txt}", c["value"] == "autonomo" and c.get("strategy") == strat and c.get("deg") == deg)
    check("falta submodo / rumbo", vc.missing_for(vc.from_text("modo autonomo")) == "strategy"
          and vc.missing_for(vc.from_text("modo autonomo por rumbo")) == "heading")
    check("respuestas por voz", vc.auto_reply("solo esquivar", "strategy")["strategy"] == "evadir"
          and vc.auto_reply("noventa", "heading")["deg"] == 90 and vc.auto_reply("detente", "strategy") is None)
    check("parada tras saludo", not jarvis.is_question("ayuda, detente"))
    check("confirm heading", "90 grados" in jarvis.confirm({"t": "heading", "deg": 90}))
    sp = jarvis.to_speech("Divisor de 1 kΩ a 3,3 V, 20 kHz, 30 ms, 0x29, GPIO 8, 50 %.")
    check("to_speech unidades", all(w in sp for w in ("kiloohmios", "voltios", "kilohercios",
                                                       "milisegundos", "por ciento")) and "%" not in sp)
    print("Todas las pruebas de la app Streamlit pasaron.")


if __name__ == "__main__":
    main()
