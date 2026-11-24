#!/usr/bin/env python3
"""Espejo en Python de la clasificacion de color del firmware (RF-05).

IMPORTANTE: este archivo replica el algoritmo de
    firmware/esp32s3_robot/ColorSensor.cpp :: classifyColor()
para poder verificar la logica SIN hardware. Los umbrales son los mismos que
en Config.h (calibracion 2026-11-23) y los casos son las lecturas reales de
tools/datos_color/color_2026-11-23_1058.csv y _1329.csv (sensor mas pegado a la
superficie) (prueba T-Color-01).

Si cambias el algoritmo o los umbrales en C++, cambia aqui y ejecuta run_all.py.
"""
from __future__ import annotations

import csv
import math
from pathlib import Path

# Mismos valores que Config.h
TCS_DARK_CLEAR = 300
TCS_RED_HUE_MAX = 15.0
TCS_RED_HUE_WRAP = 330.0
TCS_RED_SAT_MIN = 0.50
TCS_WARM_HUE_MAX = 70.0
TCS_GREEN_HUE_MAX = 160.0
TCS_BLUE_HUE_MAX = 260.0
TCS_YELLOW_SAT_MIN = 0.66
TCS_BW_CLEAR_SPLIT = 9500

NEGRO = "negro"
BLANCO = "blanco"
ROJO = "rojo"
AMARILLO = "amarillo"
VERDE = "verde"
AZUL = "azul"
DESCONOCIDO = "desconocido"

_DATOS = Path(__file__).resolve().parents[2] / "tools" / "datos_color"
CALIBRACIONES = [_DATOS / "color_2026-11-23_1058.csv", _DATOS / "color_2026-11-23_1329.csv"]


def classify_color(r: int, g: int, b: int, clear: int) -> str:
    """Clasificacion por tono, igual que classifyColor() del firmware."""
    if clear < TCS_DARK_CLEAR:
        return NEGRO

    rf, gf, bf = float(r), float(g), float(b)
    mx, mn = max(rf, gf, bf), min(rf, gf, bf)
    delta = mx - mn

    if mx <= 0.0:
        return NEGRO
    if delta <= 0.0:
        return NEGRO if clear < TCS_BW_CLEAR_SPLIT else BLANCO

    sat = delta / mx
    if mx == rf:
        hue = 60.0 * math.fmod((gf - bf) / delta, 6.0)
    elif mx == gf:
        hue = 60.0 * (((bf - rf) / delta) + 2.0)
    else:
        hue = 60.0 * (((rf - gf) / delta) + 4.0)
    if hue < 0.0:
        hue += 360.0

    red_hue = hue < TCS_RED_HUE_MAX or hue >= TCS_RED_HUE_WRAP
    if red_hue and sat >= TCS_RED_SAT_MIN:
        return ROJO
    if red_hue or hue < TCS_WARM_HUE_MAX:
        if sat >= TCS_YELLOW_SAT_MIN:
            return AMARILLO
        return NEGRO if clear < TCS_BW_CLEAR_SPLIT else BLANCO
    if hue < TCS_GREEN_HUE_MAX:
        return VERDE
    if hue < TCS_BLUE_HUE_MAX:
        return AZUL
    return DESCONOCIDO


def check(name: str, cond: bool) -> None:
    print(f"[{'OK  ' if cond else 'FALLA'}] {name}")
    if not cond:
        raise AssertionError(name)


def main() -> None:
    print("== Pruebas de clasificacion de color (RF-05) ==")

    # Medianas reales por posicion (calibracion 2026-11-23 10:58): (R, G, B, clear)
    casos = [
        ("negro pos1", (3182, 2631, 1643, 7640), NEGRO),
        ("negro pos2", (2229, 1917, 1296, 5469), NEGRO),
        ("negro pos3", (2185, 1904, 1323, 5277), NEGRO),
        ("blanco pos1", (7568, 6106, 3926, 17806), BLANCO),
        ("blanco pos2", (9675, 7685, 4844, 22560), BLANCO),
        ("blanco pos3", (9258, 7294, 4550, 21509), BLANCO),
        ("rojo pos1", (6896, 1662, 1299, 9408), ROJO),
        ("rojo pos2", (6080, 1356, 1066, 8091), ROJO),
        ("rojo pos3 (x3 de brillo, reflejo)", (20671, 4319, 3347, 27016), ROJO),
        ("amarillo pos1", (8171, 5717, 2220, 16377), AMARILLO),
        ("amarillo pos2", (9556, 6615, 2411, 19023), AMARILLO),
        ("amarillo pos3", (10722, 7145, 2650, 20971), AMARILLO),
        ("verde pos1", (1678, 2759, 1257, 5614), VERDE),
        ("verde pos2", (1832, 2975, 1459, 6011), VERDE),
        ("verde pos3", (1470, 2233, 1168, 4564), VERDE),
        ("azul pos1", (3196, 4691, 4880, 12867), AZUL),
        ("azul pos2", (2707, 3657, 3731, 9752), AZUL),
        ("azul pos3", (2698, 3697, 3862, 9886), AZUL),
        # Robustez
        ("sin luz", (0, 0, 0, 0), NEGRO),
        ("casi sin luz", (90, 70, 40, 200), NEGRO),
        ("gris oscuro exacto", (2000, 2000, 2000, 6000), NEGRO),
        ("gris claro exacto", (7000, 7000, 7000, 21000), BLANCO),
        ("rojo con reflejo x2 (mismo tono)", (13792, 3324, 2598, 18816), ROJO),
        ("verde con reflejo x2 (mismo tono)", (3356, 5518, 2514, 11228), VERDE),
        ("azul con poca luz (mismo tono)", (1350, 1845, 1931, 4943), AZUL),
        ("blanco calido poco saturado no es rojo", (9000, 7300, 6500, 22000), BLANCO),
        ("rojo puro", (1000, 60, 60, 1500), ROJO),
        ("amarillo puro", (1000, 1000, 50, 2000), AMARILLO),
        ("verde puro", (60, 1000, 60, 1500), VERDE),
        ("azul puro", (60, 60, 1000, 1500), AZUL),
        ("magenta no es de los 6 -> desconocido", (1000, 60, 1000, 2000), DESCONOCIDO),
        ("violeta no es de los 6 -> desconocido", (600, 60, 1000, 1800), DESCONOCIDO),
    ]
    for nombre, (r, g, b, c), esperado in casos:
        got = classify_color(r, g, b, c)
        check(f"{nombre}: {got}", got == esperado)

    # Las lecturas completas de cada calibracion
    for archivo in CALIBRACIONES:
        if not archivo.exists():
            continue
        with archivo.open(encoding="utf-8") as f:
            filas = list(csv.DictReader(f))
        malas = [x for x in filas
                 if classify_color(int(x["r"]), int(x["g"]), int(x["b"]), int(x["clear"])) != x["esperado"]]
        check(f"{archivo.name}: {len(filas) - len(malas)}/{len(filas)} lecturas correctas", not malas)

    print("\nRESULTADO: todas las comprobaciones pasaron")


if __name__ == "__main__":
    main()
