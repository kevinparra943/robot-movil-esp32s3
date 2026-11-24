#!/usr/bin/env python3
"""Calibración guiada del sensor de color TCS34725 (RF-05, prueba T-Color-01).

Funciona con el firmware actual, sin recargarlo: por el puerto USB envía el
comando SENSORS y lee la línea «Color : <nombre> rgb=(R,G,B) clear=C».

Uso (con el robot conectado por USB y el Monitor Serie de Arduino CERRADO):
    python tools/calibrar_color.py                 # detecta el puerto solo
    python tools/calibrar_color.py --port COM17    # o indícalo
    python tools/calibrar_color.py --analizar tools/datos_color/color_XXXX.csv

Para cada color pide colocar la muestra bajo el sensor en varias posiciones,
captura lecturas, guarda un CSV y compara cada lectura con los umbrales
actuales de Config.h (mismo algoritmo que el firmware, vía tests/host/test_color.py).
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import math
import re
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "tools" / "datos_color"
COLORES = ["negro", "blanco", "rojo", "amarillo", "verde", "azul"]
LINEA_COLOR = re.compile(r"Color\s*:\s*(\S+)\s+rgb=\((\d+),(\d+),(\d+)\)\s+clear=(\d+)")


def cargar_clasificador():
    """classify_color() de tests/host/test_color.py (espejo del firmware)."""
    path = ROOT / "tests" / "host" / "test_color.py"
    spec = importlib.util.spec_from_file_location("espejo_color", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.classify_color


# ---------------------------------------------------------------- captura
def abrir_puerto(port: str | None):
    import serial
    import serial.tools.list_ports as lp

    if not port:
        puertos = list(lp.comports())
        esp = [p for p in puertos if p.vid in (0x303A, 0x10C4, 0x1A86)]  # Espressif, CP210x, CH340
        elegido = (esp or puertos or [None])[0]
        if elegido is None:
            sys.exit("No hay ningún puerto serie. Conecta el robot por USB (y cierra el Monitor Serie).")
        port = elegido.device
        print(f"Puerto detectado: {port} ({elegido.description})")
    ser = serial.Serial()
    ser.port, ser.baudrate, ser.timeout = port, 115200, 0.1
    ser.dtr = ser.rts = False          # evita reiniciar la placa al abrir
    try:
        ser.open()
    except serial.SerialException as exc:
        sys.exit(f"No se pudo abrir {port}: {exc}\n¿Está abierto el Monitor Serie de Arduino? Ciérralo.")
    time.sleep(1.5)
    ser.reset_input_buffer()
    return ser


def comprobar_enlace(ser) -> None:
    ser.write(b"PING\n")
    fin = time.time() + 3
    while time.time() < fin:
        linea = ser.readline().decode(errors="ignore").strip()
        if linea.startswith("PONG"):
            print(f"Robot responde: {linea}")
            return
    sys.exit("El robot no respondió a PING. Revisa el puerto, el cable y que el firmware esté cargado.")


def capturar(ser, n: int) -> list[tuple[int, int, int, int, str]]:
    """Pide SENSORS cada ~0,2 s hasta reunir n lecturas válidas."""
    muestras, fallos = [], 0
    while len(muestras) < n:
        ser.reset_input_buffer()
        ser.write(b"SENSORS\n")
        fin = time.time() + 1.0
        while time.time() < fin:
            linea = ser.readline().decode(errors="ignore")
            if "Color" not in linea:
                continue
            m = LINEA_COLOR.search(linea)
            if m:
                nombre, r, g, b, c = m.group(1), *map(int, m.groups()[1:])
                muestras.append((r, g, b, c, nombre))
            else:
                fallos += 1   # «sin lectura valida»
            break
        if fallos > 10 and not muestras:
            sys.exit("El sensor de color no da lecturas válidas (¿responde 0x29 en SCAN?).")
        print(f"\r   {len(muestras)}/{n} lecturas", end="", flush=True)
        time.sleep(0.2)
    print()
    return muestras


def sesion(args) -> Path:
    ser = abrir_puerto(args.port)
    comprobar_enlace(ser)
    print("\nColoca el robot como en la pista (misma altura del sensor y misma luz).")
    print(f"Se capturan {args.muestras} lecturas por posición y {args.posiciones} posiciones por color.\n")
    filas = []
    for color in args.colores:
        for pos in range(1, args.posiciones + 1):
            extra = "" if pos == 1 else " (muévela un poco: otra zona de la muestra)"
            input(f"Coloca {color.upper()} bajo el sensor, posición {pos}/{args.posiciones}{extra} y pulsa Enter... ")
            lecturas = capturar(ser, args.muestras)
            if all(r == g == b == c == 0 for r, g, b, c, _ in lecturas):
                ser.close()
                sys.exit("\nEl sensor devuelve 0 en todos los canales: el TCS34725 está apagado o sin "
                         "inicializar\n(suele pasar si se movió su cable con el robot encendido). Revisa VIN/GND/SDA/SCL,\n"
                         "pulsa RESET en la placa (o desconecta y conecta el USB) y vuelve a ejecutar.")
            for r, g, b, c, fw in lecturas:
                filas.append({"esperado": color, "posicion": pos, "r": r, "g": g, "b": b, "clear": c, "firmware": fw})
        # Comprobación temprana: con negro y blanco ya se sabe si el montaje sirve.
        negro, blanco = mediana_clear(filas, "negro"), mediana_clear(filas, "blanco")
        if color == "blanco" and negro and blanco and blanco / negro < CONTRASTE_MIN:
            print(f"\nAVISO: contraste blanco/negro = {blanco / negro:.2f} (debería ser ≥ {CONTRASTE_MIN}).")
            print("El sensor ve sobre todo luz ambiente: acércalo a 3–10 mm de la superficie y tápalo")
            print("con un tubo o cartulina negra. Seguir así producirá una calibración inútil.")
            if input("¿Continuar de todos modos? (s/N) ").strip().lower() != "s":
                ser.close()
                sys.exit("Captura cancelada. Corrige el montaje y vuelve a ejecutar.")
    ser.close()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    salida = Path(args.salida) if args.salida else DATA_DIR / f"color_{datetime.now():%Y-%m-%d_%H%M}.csv"
    with salida.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["esperado", "posicion", "r", "g", "b", "clear", "firmware"])
        w.writeheader()
        w.writerows(filas)
    print(f"\nMuestras guardadas en: {salida}")
    return salida


# ---------------------------------------------------------------- análisis
def rasgos(r: int, g: int, b: int, c: int) -> dict[str, float]:
    rf, gf, bf = float(r), float(g), float(b)
    mx, mn = max(rf, gf, bf), min(rf, gf, bf)
    hue = float("nan")
    if mx > mn:
        d = mx - mn
        if mx == rf:
            hue = 60.0 * math.fmod((gf - bf) / d, 6.0)
        elif mx == gf:
            hue = 60.0 * ((bf - rf) / d + 2.0)
        else:
            hue = 60.0 * ((rf - gf) / d + 4.0)
        hue = hue + 360.0 if hue < 0 else hue
    return {
        "clear": float(c),
        "sat": (mx - mn) / mx if mx > 0 else 0.0,
        "hue": hue,
        "R/G": rf / (gf or 1.0),
        "G/R": gf / (rf or 1.0),
        "B/R": bf / (rf or 1.0),
        "G/B": gf / (bf or 1.0),
    }


CONTRASTE_MIN = 1.8      # clear(blanco) / clear(negro) mínimo esperable con el LED cerca
DISPERSION_MAX = 1.35    # clear máx/mín entre posiciones del mismo color


def mediana_clear(filas: list[dict], color: str, posicion: str | None = None) -> float | None:
    vals = [int(x["clear"]) for x in filas
            if x["esperado"] == color and (posicion is None or str(x["posicion"]) == posicion)]
    return statistics.median(vals) if vals else None


def diagnostico(filas: list[dict]) -> list[str]:
    """Problemas de montaje que impiden calibrar, aunque los umbrales se ajusten."""
    avisos = []
    ceros = sum(1 for x in filas if not any(int(x[k]) for k in ("r", "g", "b", "clear")))
    if ceros == len(filas):
        return ["Todas las lecturas valen 0: el TCS34725 estaba apagado o sin inicializar (no midió nada). "
                "Revisa su cableado, reinicia la placa y repite la captura."]
    if ceros:
        avisos.append(f"{ceros} lecturas valen 0 en todos los canales: el sensor se apagó durante la captura.")
    negro, blanco = mediana_clear(filas, "negro"), mediana_clear(filas, "blanco")
    if negro and blanco:
        contraste = blanco / negro
        if contraste < CONTRASTE_MIN:
            avisos.append(
                f"Contraste blanco/negro = {contraste:.2f} (debería ser ≥ {CONTRASTE_MIN}). El sensor recibe "
                "sobre todo luz ambiente o reflejos, no la luz reflejada por la muestra: acércalo a la "
                "superficie (3–10 mm) y tápalo con un tubo o cartulina negra.")
    # Solo negro y blanco se separan por brillo; en los demás manda el tono,
    # que no cambia con reflejos ni con la altura.
    for color in ("negro", "blanco"):
        meds = [m for p in sorted({str(x["posicion"]) for x in filas})
                if (m := mediana_clear(filas, color, p))]
        if len(meds) >= 2 and max(meds) / min(meds) > DISPERSION_MAX:
            avisos.append(
                f"{color}: el brillo cambia ×{max(meds) / min(meds):.1f} entre posiciones "
                f"({', '.join(f'{m:.0f}' for m in meds)}). Cambió la altura, la inclinación o la luz; "
                "o la muestra es brillante (reflejo) o más pequeña que el área del sensor.")
    return avisos


def analizar(path: Path) -> bool:
    clasificar = cargar_clasificador()
    with path.open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    if not filas:
        sys.exit(f"{path} no tiene muestras.")
    colores = [c for c in COLORES if any(x["esperado"] == c for x in filas)]

    print(f"\n== Resultado con los umbrales actuales de Config.h ({len(filas)} lecturas) ==")
    print(f"{'color':<10}{'aciertos':>10}   confusiones")
    todo_ok = True
    for color in colores:
        sub = [x for x in filas if x["esperado"] == color]
        got = [clasificar(int(x["r"]), int(x["g"]), int(x["b"]), int(x["clear"])) for x in sub]
        ok = sum(1 for g in got if g == color)
        pct = 100.0 * ok / len(sub)
        conf: dict[str, int] = {}
        for g in got:
            if g != color:
                conf[g] = conf.get(g, 0) + 1
        texto = ", ".join(f"{k} ×{v}" for k, v in sorted(conf.items(), key=lambda kv: -kv[1])) or "—"
        marca = "OK " if pct >= 95 else "MAL"
        todo_ok &= pct >= 95
        print(f"{color:<10}{ok:>4}/{len(sub):<4}{pct:5.0f} %  [{marca}] {texto}")

    print("\n== Rasgos medidos por color: mínimo / mediana / máximo ==")
    claves = ["clear", "sat", "hue", "R/G", "G/R", "B/R", "G/B"]
    print(f"{'color':<10}" + "".join(f"{k:>22}" for k in claves))
    for color in colores:
        sub = [rasgos(int(x["r"]), int(x["g"]), int(x["b"]), int(x["clear"])) for x in filas if x["esperado"] == color]
        celdas = []
        for k in claves:
            vals = [s[k] for s in sub if not math.isnan(s[k])]
            if not vals:
                celdas.append(f"{'—':>22}")
                continue
            dec = 0 if k in ("clear", "hue") else 2
            celdas.append(f"{min(vals):>8.{dec}f}/{statistics.median(vals):.{dec}f}/{max(vals):.{dec}f}".rjust(22))
        print(f"{color:<10}" + "".join(celdas))

    avisos = diagnostico(filas)
    print()
    if avisos:
        print("== Avisos de captura ==" if todo_ok else
              "== Problemas de captura (corrígelos y repite antes de ajustar umbrales) ==")
        for a in avisos:
            print(f" - {a}")
        print()
    if todo_ok:
        print("Todos los colores ≥ 95 %: los umbrales actuales sirven con esta luz y montaje.")
    elif avisos:
        print("Con estos problemas de montaje ningún ajuste de umbrales será fiable: repite la captura.")
    else:
        print("Hay colores por debajo del 95 %: hay que ajustar los umbrales TCS_* de Config.h.")
        print(f"Comparte este archivo con Claude para recalcularlos: {path}")
    return todo_ok


def main() -> None:
    ap = argparse.ArgumentParser(description="Calibración guiada del sensor de color TCS34725.")
    ap.add_argument("--port", help="Puerto serie (p. ej. COM17). Si se omite, se detecta.")
    ap.add_argument("--muestras", type=int, default=25, help="Lecturas por posición (25).")
    ap.add_argument("--posiciones", type=int, default=3, help="Posiciones por color (3).")
    ap.add_argument("--colores", nargs="+", default=COLORES, choices=COLORES, help="Colores a capturar.")
    ap.add_argument("--salida", help="Ruta del CSV de salida.")
    ap.add_argument("--analizar", help="Solo analiza un CSV ya capturado (sin placa).")
    args = ap.parse_args()

    path = Path(args.analizar) if args.analizar else sesion(args)
    sys.exit(0 if analizar(path) else 1)


if __name__ == "__main__":
    main()
