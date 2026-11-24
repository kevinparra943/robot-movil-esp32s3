#!/usr/bin/env python3
"""Pruebas del piloto autonomo (Navigator, RF-04 + RF-06) sin placa.

Replica 1:1 la logica de firmware/esp32s3_robot/Navigator.cpp con los
parametros de Config.h y comprueba:
  - control P: corrige hacia el rumbo deseado con el signo correcto;
  - giro en sitio si el error supera NAV_ALIGN_DEG;
  - ante un obstaculo frontal: EVADIR -> BORDEAR -> REORIENTAR -> NAVEGAR,
    volviendo al rumbo deseado (sigue el trayecto);
  - encerrado por los tres sensores: RETROCEDER;
  - submodo linea: sigue la linea, la busca al perderla y vuelve a ella tras
    rodear un obstaculo (VOLVER);
  - submodo evadir: ignora rumbo y linea; rumbo sin brujula: avanza y esquiva.
Si cambias Navigator.cpp o los NAV_* de Config.h, actualiza este archivo.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, replace
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / "firmware" / "esp32s3_robot" / "Config.h"


def load_config() -> dict[str, float]:
    vals: dict[str, float] = {}
    for m in re.finditer(r"#define\s+(\w+)\s+(-?[\d.]+)f?\b", CONFIG.read_text(encoding="utf-8")):
        vals[m.group(1)] = float(m.group(2))
    return vals


C = load_config()
V = int(C["AUTO_DRIVE_SPEED"])
W = int(C["AUTO_TURN_SPEED"])


@dataclass
class NavInput:
    heading_valid: bool = True
    heading: float = 0.0
    target_valid: bool = True
    target: float = 0.0
    front: bool = False
    left: bool = False
    right: bool = False
    left_valid: bool = False
    right_valid: bool = False
    left_cm: float = math.nan
    right_cm: float = math.nan
    on_color: bool = False


def angle_error(target: float, actual: float) -> float:
    return ((target - actual + 540.0) % 360.0) - 180.0


def clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


class Navigator:
    def __init__(self, strategy: str = "rumbo") -> None:
        self.reset(0, strategy)

    def reset(self, now: int, strategy: str) -> None:
        self.strategy = strategy
        self.evade = 0
        self.heading_mode = False
        self.line_side = -1
        self.white_since = 0
        self.sweep_dir, self.sweep_step, self.sweep_since = -1, 1, 0
        self.enter("NAVEGAR", now)

    def enter(self, s: str, now: int) -> None:
        self.state = s
        self.since = now
        self.side_clear_since = 0

    def enter_search(self, first_dir: int, now: int) -> None:
        self.enter("BUSCAR_LINEA", now)
        self.sweep_dir = 1 if first_dir >= 0 else -1
        self.sweep_step = 1
        self.sweep_since = now

    @staticmethod
    def arc(d: int, speed: int) -> tuple[int, int]:
        outer = int(speed)
        inner = round(speed * C["LINE_ARC_INNER_RATIO"])
        return (outer, inner) if d > 0 else (inner, outer)

    @staticmethod
    def spin(d: int, speed: int) -> tuple[int, int]:
        # pivota sobre la rueda izquierda (igual que Navigator::spin)
        return (0, -speed) if d > 0 else (0, speed)

    def choose(self, i: NavInput) -> int:
        if i.left and not i.right:
            return +1
        if i.right and not i.left:
            return -1
        if i.left_valid and i.right_valid:
            return -1 if i.left_cm > i.right_cm else +1
        if i.left_valid and not i.right_valid:
            return +1
        if i.right_valid and not i.left_valid:
            return -1
        if self.heading_mode:
            return +1 if angle_error(i.target, i.heading) >= 0 else -1
        return +1

    def step(self, i: NavInput, now: int) -> tuple[int, int]:
        in_state = now - self.since
        self.heading_mode = self.strategy == "rumbo" and i.target_valid and i.heading_valid

        if self.state != "RETROCEDER" and i.front and i.left and i.right:
            self.enter("RETROCEDER", now)
        elif i.front and self.state in ("NAVEGAR", "BUSCAR_LINEA", "BORDEAR", "REORIENTAR", "VOLVER", "ALINEAR"):
            if self.state not in ("BORDEAR", "VOLVER") or self.evade == 0:
                self.evade = self.choose(i)
            self.enter("EVADIR", now)
        in_state = now - self.since

        s = self.state
        if s == "RETROCEDER":
            if in_state >= C["NAV_BACK_MS"]:
                self.evade = self.choose(i)
                self.enter("EVADIR", now)
                return self.step(i, now)
            return (-V, -V)
        if s == "EVADIR":
            if i.front:
                self.side_clear_since = 0
            else:
                self.side_clear_since = self.side_clear_since or now or 1
                if now - self.side_clear_since >= C["NAV_EVADE_EXTRA_MS"]:
                    self.enter("BORDEAR", now)
                    return (V, V)
            if in_state >= C["NAV_EVADE_MAX_MS"]:
                self.enter("RETROCEDER", now)
                return (-V, -V)
            return (W, -W) if self.evade > 0 else (-W, W)
        if s == "BORDEAR":
            side_sees = i.left if self.evade > 0 else i.right
            if side_sees:
                self.side_clear_since = 0
            elif self.side_clear_since == 0:
                self.side_clear_since = now or 1
            bypass = C["NAV_LINE_BYPASS_MS" if self.strategy == "linea" else "NAV_BYPASS_MS"]
            passed = self.side_clear_since != 0 and now - self.side_clear_since >= bypass
            if passed or in_state >= C["NAV_BORDEAR_MAX_MS"]:
                if self.heading_mode:
                    self.enter("REORIENTAR", now)
                elif self.strategy == "linea":
                    self.enter("VOLVER", now)
                else:
                    self.evade = 0
                    self.enter("NAVEGAR", now)
                return self.step(i, now)
            return (V, V)
        if s == "REORIENTAR":
            if not self.heading_mode:
                self.evade = 0
                self.enter("NAVEGAR", now)
                return self.step(i, now)
            e = angle_error(i.target, i.heading)
            if abs(e) <= C["NAV_REALIGN_OK_DEG"]:
                self.evade = 0
                self.enter("NAVEGAR", now)
                return self.step(i, now)
            to_right = e > 0
            if (to_right and i.right) or (not to_right and i.left):
                return (V, V)
            return (W, -W) if to_right else (-W, W)
        if s == "VOLVER":
            side = -1 if self.evade > 0 else 1
            if i.on_color:
                self.line_side = side
                self.evade = 0
                self.align_white = False
                self.enter("ALINEAR", now)
                return self.step(i, now)
            if in_state >= C["NAV_RETURN_MAX_MS"]:
                self.enter_search(side, now)
                return self.step(i, now)
            stop = C["OBSTACLE_STOP_CM"]
            if (i.left_valid and i.left_cm < stop) if side < 0 else (i.right_valid and i.right_cm < stop):
                return (V, V)
            outer = int(C["NAV_RETURN_SPEED"])
            inner = 0 if in_state % C["NAV_RETURN_PERIOD_MS"] < C["NAV_RETURN_PIVOT_MS"] else outer
            return (inner, outer) if side < 0 else (outer, inner)
        if s == "ALINEAR":
            self.align_white = self.align_white or not i.on_color
            if (self.align_white and i.on_color) or in_state >= C["NAV_LINE_ALIGN_MS"]:
                self.white_since = 0
                self.enter("NAVEGAR", now)
                return self.step(i, now)
            return self.arc(-self.line_side, C["NAV_RETURN_SPEED"])
        if s == "BUSCAR_LINEA":
            if i.on_color:
                self.line_side = self.sweep_dir
                self.evade = 0
                self.white_since = 0
                self.enter("NAVEGAR", now)
                return self.step(i, now)
            if now - self.sweep_since >= C["LINE_SWEEP_MS"] * self.sweep_step:
                self.sweep_dir = -self.sweep_dir
                self.sweep_step = 1 if self.sweep_step >= C["LINE_SWEEP_STEPS"] else self.sweep_step + 1
                self.sweep_since = now
            return self.spin(self.sweep_dir, int(C["LINE_SEARCH_SPEED"]))
        # NAVEGAR
        if self.heading_mode:
            e = angle_error(i.target, i.heading)
            if abs(e) > C["NAV_ALIGN_DEG"]:
                return (W, -W) if e > 0 else (-W, W)
            corr = clamp(round(C["NAV_KP"] * e), -int(C["NAV_MAX_CORR"]), int(C["NAV_MAX_CORR"]))
            return (clamp(V + corr, -100, 100), clamp(V - corr, -100, 100))
        if self.strategy != "linea":
            return (V, V)
        if i.on_color:
            self.white_since = 0
            return self.arc(-self.line_side, C["LINE_FOLLOW_SPEED"])
        if self.white_since == 0:
            self.white_since = now or 1
        if now - self.white_since >= C["LINE_LOST_MS"]:
            self.enter_search(self.line_side, now)
            return self.step(i, now)
        return self.arc(self.line_side, C["LINE_RETURN_SPEED"])


def check(name: str, cond: bool) -> None:
    print(f"[{'OK  ' if cond else 'FALLA'}] {name}")
    if not cond:
        raise AssertionError(name)


def simulate_avoidance() -> None:
    """Robot a rumbo 90 encuentra un obstaculo y debe volver a 90 +/- 10."""
    nav = Navigator()
    heading = 90.0
    base = NavInput(heading=heading, target=90.0)
    t = 0
    dt = int(C["AUTO_DECISION_MS"])
    visited: list[str] = []

    def run(phase_ms: int, **kw) -> None:
        nonlocal t, heading
        end = t + phase_ms
        while t < end:
            out = nav.step(replace(base, heading=heading, **kw), t)
            # Modelo cinematico simple: diferencia de ruedas -> giro (grados/paso).
            heading = (heading + (out[0] - out[1]) * 0.05) % 360.0
            if not visited or visited[-1] != nav.state:
                visited.append(nav.state)
            t += dt

    run(500)                                          # navegando recto
    run(800, front=True)                              # obstaculo delante
    run(800, left=True)                               # lo bordea por la izquierda
    run(3000)                                         # libre: reorienta y navega
    check("evasion recorre EVADIR->BORDEAR->REORIENTAR->NAVEGAR",
          visited[:5] == ["NAVEGAR", "EVADIR", "BORDEAR", "REORIENTAR", "NAVEGAR"])
    check(f"vuelve al rumbo deseado (90 +/- 10, final {heading:.1f})",
          abs(angle_error(90.0, heading)) <= C["NAV_REALIGN_OK_DEG"])


def simulate_line(radius_cm: float, sentido: int, deadband_pct: int = 30,
                  secs: float = 40.0) -> tuple[float, float, float]:
    """Sigue una cinta de 2 cm en forma de circulo con un solo sensor.

    Modelo: rueda 6,5 cm a 110 rpm (37 cm/s al 100 %), 13 cm entre ruedas,
    sensor 6 cm delante del eje que lee cada 120 ms (TCS34725), decision cada
    50 ms, offset de balance de la rueda izquierda y zona muerta de los TT
    (por debajo de deadband_pct % el motor no arranca). sentido +1 = la curva
    va a la izquierda. Devuelve (vueltas hacia adelante, maximo tiempo seguido
    sin ver la linea en s, % del tiempo con el robot quieto).
    """
    vmax, base, ahead, half_w = 37.0, 13.0, 6.0, 1.0
    off_l, deadband = int(C["MOTOR_LEFT_SPEED_OFFSET"]), deadband_pct

    def motor(cmd_pct: int, offset: int) -> float:
        """Offset en el sentido de giro (ControlManual) + zona muerta del TT."""
        if cmd_pct == 0:
            return 0.0
        mag = max(0, abs(cmd_pct) + offset)
        if mag < deadband:
            return 0.0
        return (mag if cmd_pct > 0 else -mag) / 100 * vmax
    nav = Navigator("linea")
    x, y = radius_cm, 0.0
    th = math.pi / 2 if sentido > 0 else -math.pi / 2
    t, dt, last_sample, on, cmd = 0, 10, -1000, True, (0, 0)
    prev_ang, progress, lost, max_lost, stopped = 0.0, 0.0, 0, 0, 0
    while t < secs * 1000:
        if t - last_sample >= 120:
            last_sample = t
            sx, sy = x + ahead * math.cos(th), y + ahead * math.sin(th)
            on = abs(math.hypot(sx, sy) - radius_cm) <= half_w
        if t % int(C["AUTO_DECISION_MS"]) == 0:
            cmd = nav.step(NavInput(heading_valid=False, target_valid=False, on_color=on), t)
        vl, vr = motor(cmd[0], off_l), motor(cmd[1], 0)
        if vl == 0 and vr == 0:
            stopped += dt
        x += (vl + vr) / 2 * math.cos(th) * dt / 1000
        y += (vl + vr) / 2 * math.sin(th) * dt / 1000
        th += (vr - vl) / base * dt / 1000
        ang = math.atan2(y, x)
        progress += ((ang - prev_ang + math.pi) % (2 * math.pi) - math.pi) * sentido
        prev_ang = ang
        lost = 0 if on else lost + dt
        max_lost = max(max_lost, lost)
        t += dt
    return progress / (2 * math.pi), max_lost / 1000, 100 * stopped / (secs * 1000)


def simulate_line_obstacle(ancho: float, libre: int, deadband: int) -> dict:
    """Cinta recta (2 cm, eje x; el robot arranca sobre su borde derecho) con una caja de ancho x 10 cm centrada en x=60.

    Mismo modelo de motores que simulate_line. Los HC-SR04 se modelan como conos
    de 5 rayos (+/-15 grados) y `libre` fuerza el lado con una pared lejana en el
    otro. "choque": la caja entra en el circulo de 8 cm de radio del robot.
    """
    # El offset izquierdo corrige un motor mas rapido: aqui solo cuenta para la
    # zona muerta, no para la velocidad (a igual consigna el robot va recto).
    vmax, base, off_l = 37.0, 13.0, int(C["MOTOR_LEFT_SPEED_OFFSET"])
    x0, x1, half = 60.0, 70.0, ancho / 2

    def motor(c: int, off: int) -> float:
        return 0.0 if abs(c) + off < deadband else c / 100 * vmax

    def ray(px: float, py: float, a: float) -> float:
        dx, dy = math.cos(a) or 1e-9, math.sin(a) or 1e-9
        tx = sorted(((x0 - px) / dx, (x1 - px) / dx))
        ty = sorted(((-half - py) / dy, (half - py) / dy))
        near, far = max(tx[0], ty[0]), min(tx[1], ty[1])
        return near if far >= near and near > 0 else 999.0

    def sonar(a: float) -> float:
        px, py = x + 7 * math.cos(a), y + 7 * math.sin(a)
        return min(ray(px, py, a + math.radians(d)) for d in (-15, -7, 0, 7, 15))

    nav = Navigator("linea")
    x, y, th, t, dt = 0.0, 0.0, 0.0, 0, 10
    on, cmd, volvio, evadio = True, (0, 0), None, False
    choques, dist = 0, (999.0, 999.0, 999.0)
    while t < 60000 and x < 220:
        if t % 120 == 0:
            on = abs(y + 6 * math.sin(th)) <= 1.0
        if t % 90 == 0:
            dist = (sonar(th), sonar(th + math.pi / 2), sonar(th - math.pi / 2))
        if t % 50 == 0:
            lim = C["OBSTACLE_DETECT_CM"]
            f, l, r = dist
            lv, rv = (min(l, 100), 200.0) if libre > 0 else (200.0, min(r, 100))
            cmd = nav.step(NavInput(heading_valid=False, target_valid=False, front=f < lim,
                                    left=l < lim, right=r < lim, left_valid=True, right_valid=True,
                                    left_cm=lv, right_cm=rv, on_color=on), t)
            evadio = evadio or nav.state == "EVADIR"
            if evadio and volvio is None and nav.state == "NAVEGAR":
                volvio = round(x)
        vl, vr = motor(cmd[0], off_l), motor(cmd[1], 0)
        x += (vl + vr) / 2 * math.cos(th) * dt / 1000
        y += (vl + vr) / 2 * math.sin(th) * dt / 1000
        th += (vr - vl) / base * dt / 1000
        cx, cy = max(x0, min(x, x1)), max(-half, min(y, half))
        choques += math.hypot(x - cx, y - cy) < 8
        t += dt
    return {"x": x, "volvio": volvio, "choques": choques, "y": y}


def main() -> None:
    print("== Pruebas del Navigator (RF-04/RF-06) ==")

    nav = Navigator()
    out = nav.step(NavInput(heading=80.0, target=90.0), 0)
    check("error +10: corrige a la derecha (izq > der)", out[0] > out[1] and nav.state == "NAVEGAR")
    out = nav.step(NavInput(heading=100.0, target=90.0), 50)
    check("error -10: corrige a la izquierda (der > izq)", out[1] > out[0])
    out = nav.step(NavInput(heading=90.0, target=90.0), 100)
    check("error 0: recto", out == (V, V))
    out = nav.step(NavInput(heading=350.0, target=10.0), 150)
    check("cruce 350->10: gira a la derecha por el camino corto", out[0] > out[1])
    out = nav.step(NavInput(heading=0.0, target=120.0), 200)
    check("error > NAV_ALIGN_DEG: giro en sitio", out == (W, -W))

    nav = Navigator()
    nav.step(NavInput(target=0.0, front=True, left=True), 0)
    check("frente+izq bloqueados: esquiva a la derecha", nav.state == "EVADIR" and nav.evade == +1)

    nav = Navigator()
    out = nav.step(NavInput(front=True, left=True, right=True), 0)
    check("encerrado: RETROCEDER", nav.state == "RETROCEDER" and out == (-V, -V))

    # Modo linea: seguimiento del borde pivotando (velocidades por encima de la zona muerta)
    fs, rs, ss = int(C["LINE_FOLLOW_SPEED"]), int(C["LINE_RETURN_SPEED"]), int(C["LINE_SEARCH_SPEED"])
    zona_muerta = 35
    check(f"linea: velocidades >= zona muerta ({zona_muerta} %) incluso con el offset izquierdo",
          min(fs, rs) + int(C["MOTOR_LEFT_SPEED_OFFSET"]) >= zona_muerta and ss >= zona_muerta)
    nav = Navigator("linea")   # linea supuesta a la izquierda al empezar
    out = nav.step(NavInput(target_valid=False, on_color=True), 0)
    check("linea: sobre color se aleja pivotando (rueda exterior a LINE_FOLLOW_SPEED)",
          out[0] == fs and 0 <= out[1] < fs and not nav.heading_mode)
    out = nav.step(NavInput(target_valid=False, on_color=False), 50)
    check("linea: blanco breve -> vuelve hacia la linea mas lento (LINE_RETURN_SPEED), sin buscar aun",
          nav.state == "NAVEGAR" and out[1] == rs and 0 <= out[0] < rs)
    nav.step(NavInput(target_valid=False, on_color=False), 50 + int(C["LINE_LOST_MS"]))
    check("linea: blanco > LINE_LOST_MS -> BUSCAR_LINEA", nav.state == "BUSCAR_LINEA")
    out = nav.step(NavInput(target_valid=False, on_color=False), 100 + int(C["LINE_LOST_MS"]))
    check("busqueda: pivota sobre la rueda izq. hacia el ultimo lado de la linea (izq.)", out == (0, ss))
    t0 = 100 + int(C["LINE_LOST_MS"]) + int(C["LINE_SWEEP_MS"])
    out = nav.step(NavInput(target_valid=False, on_color=False), t0)
    check("busqueda: tras el primer barrido cambia de lado (vaiven)", out == (0, -ss))
    out = nav.step(NavInput(target_valid=False, on_color=True), t0 + 50)
    check("busqueda: al encontrar la linea sigue sin frenar y recuerda el lado (der.)",
          out != (0, 0) and nav.state == "NAVEGAR" and nav.line_side == +1)

    for zm in (20, 30, 35):
        for radio in (20, 35, 60):
            for sentido, lado in ((1, "izq"), (-1, "der")):
                vueltas, perdido, quieto = simulate_line(radio, sentido, deadband_pct=zm)
                check(f"simulacion (zona muerta {zm} %): curva {radio} cm {lado} -> {vueltas:.2f} vueltas, "
                      f"max {perdido:.1f} s sin linea, quieto {quieto:.0f} %",
                      vueltas > 0.8 and perdido < 1.0 and quieto < 1.0)

    # Submodos
    nav = Navigator("rumbo")
    out = nav.step(NavInput(heading_valid=False, on_color=True), 0)
    check("rumbo sin brujula: sigue recto, no sigue la linea", out == (V, V) and nav.state == "NAVEGAR")
    nav.step(NavInput(heading_valid=False, front=True), 50)
    check("rumbo sin brujula: sigue esquivando", nav.state == "EVADIR")
    nav = Navigator("rumbo")
    nav.step(NavInput(heading=90, target=90, front=True), 0)
    nav.state = "REORIENTAR"
    out = nav.step(NavInput(heading_valid=False), 50)
    check("rumbo: brujula perdida al reorientar -> recto", nav.state == "NAVEGAR" and out == (V, V))
    out = nav.step(NavInput(heading=0, target=90), 100)
    check("rumbo: al recuperar la brujula retoma el rumbo", out == (W, -W))
    nav = Navigator("evadir")
    check("evadir: ignora rumbo y linea",
          all(nav.step(NavInput(heading=0, target=90, on_color=c), t) == (V, V)
              for t, c in ((0, True), (50, False), (2000, False))))
    nav.step(NavInput(front=True), 2050)
    nav.step(NavInput(), 2100)
    t1 = 2100 + int(C["NAV_EVADE_EXTRA_MS"])
    nav.step(NavInput(), t1)
    check("evadir: gira un poco mas tras despejar y bordea", nav.state == "BORDEAR")
    nav.step(NavInput(), t1 + 50)
    out = nav.step(NavInput(), t1 + 50 + int(C["NAV_BYPASS_MS"]))
    check("evadir: tras rodear sigue recto", nav.state == "NAVEGAR" and out == (V, V))
    nav = Navigator("linea")
    nav.step(NavInput(heading=0, target=90, on_color=True), 0)
    check("linea: ignora el rumbo deseado", not nav.heading_mode)

    for lado, libre in (("der", +1), ("izq", -1)):
        for ancho in (8, 12, 16):
            for zm in (20, 30, 35):
                r = simulate_line_obstacle(ancho, libre, zm)
                check(f"linea+obstaculo {ancho} cm, rodea por la {lado}, zona muerta {zm} %: "
                      f"vuelve a {r['volvio']} cm, final {r['x']:.0f} cm, choques {r['choques']}",
                      r["choques"] == 0 and r["volvio"] is not None and r["x"] > 90)

    simulate_avoidance()
    print("Todas las pruebas del Navigator pasaron.")


if __name__ == "__main__":
    main()
