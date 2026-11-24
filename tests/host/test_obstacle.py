#!/usr/bin/env python3
"""Espejo en Python de la conversion de distancia del HC-SR04 (RF-06).

Replica la logica de
    firmware/esp32s3_robot/ObstacleSensor.cpp :: update()
para verificar SIN hardware la conversion tiempo->distancia, el rango valido,
el umbral de bloqueo y la consistencia del disparo escalonado de 3 sensores.
Constantes iguales a Config.h.
"""

SOUND_CM_PER_US = 0.0343
SONAR_MIN_CM = 2.0
SONAR_MAX_CM = 400.0
OBSTACLE_DETECT_CM = 25.0
SONAR_TIMEOUT_US = 30000
SONAR_PERIOD_MS = 90
SONAR_STAGGER_US = 30000


def pulse_to_cm(pulse_us: float) -> float:
    """Distancia = tiempo de eco * velocidad del sonido / 2 (ida y vuelta)."""
    return pulse_us * SOUND_CM_PER_US * 0.5


def is_valid(cm: float) -> bool:
    return SONAR_MIN_CM <= cm <= SONAR_MAX_CM


def is_blocked(cm: float, valid: bool) -> bool:
    return valid and cm < OBSTACLE_DETECT_CM


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"[{'OK  ' if cond else 'FALLA'}] {name} {detail}")
    if not cond:
        raise AssertionError(name)


def main() -> None:
    print("== Pruebas de distancia HC-SR04 (RF-06) ==")

    cm = pulse_to_cm(1000)
    check("1000 us -> 17.15 cm", abs(cm - 17.15) < 1e-6, f"(= {cm:.3f})")
    check("17.15 cm es valido", is_valid(cm))
    check("17.15 cm esta bloqueado (<25)", is_blocked(cm, is_valid(cm)))

    cm2 = pulse_to_cm(2000)
    check("2000 us -> 34.3 cm", abs(cm2 - 34.3) < 1e-6, f"(= {cm2:.3f})")
    check("34.3 cm no esta bloqueado", not is_blocked(cm2, is_valid(cm2)))

    check("pulso 50 us -> ~0.86 cm no valido", not is_valid(pulse_to_cm(50)))
    check("pulso 30000 us -> ~514 cm no valido", not is_valid(pulse_to_cm(30000)))

    check("25.0 cm ya NO esta bloqueado (estricto <)", not is_blocked(25.0, True))
    check("30 cm de ida -> ~600 us por lado",
          abs(pulse_to_cm(2 * 30.0 / SOUND_CM_PER_US) - 30.0) < 1e-6)

    check("periodo cubre los 3 timeouts",
          SONAR_PERIOD_MS * 1000 >= 3 * SONAR_TIMEOUT_US)
    check("stagger >= timeout de eco",
          SONAR_STAGGER_US >= SONAR_TIMEOUT_US)
    check("las 3 fases caben en un periodo",
          2 * SONAR_STAGGER_US < SONAR_PERIOD_MS * 1000)

    print("\nRESULTADO: todas las comprobaciones pasaron")


if __name__ == "__main__":
    main()
