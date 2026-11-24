#!/usr/bin/env python3
"""Pruebas de normalizacion angular (RF-04) que corren en el PC, sin placa.

Comprueba la formula de error angular minimo exigida por el enunciado:
    error = ((deseado - actual + 540) % 360) - 180

HALLAZGO IMPORTANTE (verificado aqui):
    el resultado NUNCA vale +180; el rango real es [-180, 180).
    Ejemplos: error(180, 0) = -180 y error(0, 180) = -180.
    Esto es intrinseco a la expresion, no un error de implementacion.
"""

TOL = 1e-9


def angular_error(desired: float, actual: float) -> float:
    """Error angular minimo entre deseado y actual, en [-180, 180)."""
    return ((desired - actual + 540.0) % 360.0) - 180.0


def shortest_turn(desired: float, actual: float) -> float:
    """Diferencia mas corta con signo (+ derecha, - izquierda)."""
    return angular_error(desired, actual)


def check(name: str, cond: bool) -> None:
    status = "OK  " if cond else "FALLA"
    print(f"[{status}] {name}")
    if not cond:
        raise AssertionError(name)


def main() -> None:
    print("== Pruebas de normalizacion angular (RF-04) ==")

    casos = [
        (0.0, 0.0, 0.0),
        (90.0, 0.0, 90.0),
        (270.0, 0.0, -90.0),
        (0.0, 90.0, -90.0),
        (350.0, 10.0, -20.0),
        (10.0, 350.0, 20.0),
        (180.0, 0.0, -180.0),
        (0.0, 180.0, -180.0),
        (270.0, 90.0, -180.0),
        (90.0, 270.0, -180.0),
    ]
    for d, a, esperado in casos:
        got = angular_error(d, a)
        check(f"error({d} , {a}) = {esperado}  (obtenido {got:.6f})", abs(got - esperado) < TOL)

    import random
    random.seed(1234)

    ok_rango = True
    ok_no_mas180 = True
    for _ in range(100000):
        d = random.uniform(-720, 720)
        a = random.uniform(-720, 720)
        e = angular_error(d, a)
        if not (-180.0 - TOL <= e < 180.0 + TOL):
            ok_rango = False
            print(f"   fuera de rango: d={d} a={a} e={e}")
            break
        if e >= 180.0:
            ok_no_mas180 = False
            break
    check("100000 errores aleatorios dentro de [-180, 180)", ok_rango)
    check("el resultado nunca vale +180", ok_no_mas180)

    ok_anti = True
    for _ in range(10000):
        d = random.uniform(0, 360)
        a = random.uniform(0, 360)
        e1 = angular_error(d, a)
        e2 = angular_error(a, d)
        # Fuera del limite +-180, el error debe ser antisimetrico.
        if abs(e1) < 180.0 - 1e-6 and abs(e2) < 180.0 - 1e-6:
            if abs(e1 + e2) > 1e-6:
                ok_anti = False
                break
    check("antisimetria fuera del limite +-180", ok_anti)

    ok_id = True
    for _ in range(10000):
        d = random.uniform(0, 360)
        a = random.uniform(0, 360)
        esperado = ((d - a + 540) % 360) - 180
        if abs(esperado - angular_error(d, a)) > 1e-9:
            ok_id = False
            break
    check("identidad con ((d-a+540)%360)-180", ok_id)

    print("\nRESULTADO: todas las comprobaciones pasaron")


if __name__ == "__main__":
    main()
