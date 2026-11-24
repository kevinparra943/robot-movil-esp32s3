#!/usr/bin/env python3
"""Ejecuta todas las pruebas de host del proyecto.

- Las pruebas .py corren con el mismo interprete que este script.
- Las pruebas .js corren con Node si esta en el PATH; si no, se omiten.
- Devuelve exit 0 solo si todas las pruebas disponibles pasan.

No requiere placa ni navegador.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run_one(cmd: list[str]) -> int:
    print(f"\n$ {' '.join(cmd)}")
    try:
        return subprocess.run(cmd, cwd=HERE, check=False).returncode
    except OSError as exc:
        print(f"[ERROR] No se pudo ejecutar: {exc}")
        return 1


def main() -> int:
    failures: list[str] = []

    py_tests = sorted(HERE.glob("test_*.py"))
    js_tests = sorted(HERE.glob("test_*.js"))

    print("== Pruebas de host ==")
    print(f"Python: {sys.version.split()[0]}")
    print(f"Pruebas Python: {len(py_tests)} · Pruebas JS: {len(js_tests)}")

    for test in py_tests:
        code = run_one([sys.executable, str(test)])
        if code != 0:
            failures.append(test.name)

    node = shutil.which("node")
    if node:
        for test in js_tests:
            code = run_one([node, str(test)])
            if code != 0:
                failures.append(test.name)
    elif js_tests:
        print("\n[OMITIDO] Node no esta en el PATH; se omiten las pruebas JS.")

    total = len(py_tests) + (len(js_tests) if node else 0)
    print("\n" + "=" * 52)
    if failures:
        print(f"RESULTADO: {len(failures)} prueba(s) con fallos: {', '.join(failures)}")
        return 1
    print(f"RESULTADO: {total} prueba(s) ejecutada(s), 0 fallos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
