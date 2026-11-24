"""robot_link.py - Enlace inalambrico con el robot para la app Streamlit.

- RobotLink: cliente WebSocket (protocolo v1) en un hilo propio. Guarda la
  ultima telemetria y los eventos; Streamlit solo lee el estado.
- SimLink: robot simulado con la misma interfaz (demo sin placa).

Deadman: el firmware detiene los motores si un `drive` no se renueva en
COMMAND_TTL_MS (500 ms). Un boton de Streamlit es un clic unico, asi que
`drive_for()` mantiene la consigna reenviandola cada DRIVE_REFRESH_S hasta que
vence la duracion pedida y entonces envia `stop`.
"""
from __future__ import annotations

import json
import math
import random
import threading
import time
from collections import deque

import websocket  # websocket-client

PROTOCOL_VERSION = 1
DRIVE_REFRESH_S = 0.15
DEFAULT_URL = "ws://192.168.4.1:81"


def now_ms() -> int:
    return int(time.time() * 1000)


def angle_error(target: float, actual: float) -> float:
    return ((target - actual + 540.0) % 360.0) - 180.0


class _BaseLink:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.telemetry: dict | None = None
        self.telemetry_rx_ms = 0
        self.connected = False
        self.last_error = ""
        self.events: deque[str] = deque(maxlen=40)
        self._hold: dict | None = None
        self._hold_until = 0.0
        self._stop = threading.Event()
        self._pump = threading.Thread(target=self._pump_loop, daemon=True)
        self._pump.start()

    # --- API comun --------------------------------------------------------
    def snapshot(self) -> tuple[dict | None, bool, list[str]]:
        with self._lock:
            t = json.loads(json.dumps(self.telemetry)) if self.telemetry else None
            return t, self.connected, list(self.events)

    def log(self, text: str) -> None:
        with self._lock:
            self.events.appendleft(time.strftime("%H:%M:%S ") + text)

    def drive_for(self, direction: str, speed: int, duration_ms: int, **extra) -> None:
        cmd = {"t": "drive", "v": PROTOCOL_VERSION, "dir": direction, "speed": int(speed), **extra}
        with self._lock:
            self._hold = cmd
            self._hold_until = time.time() + duration_ms / 1000.0
        self.send({**cmd, "ts": now_ms()})

    def clear_hold(self) -> None:
        """Deja de reenviar el movimiento en curso, sin mandar stop."""
        with self._lock:
            self._hold = None

    def stop(self) -> None:
        with self._lock:
            self._hold = None
        self.send({"t": "drive", "v": PROTOCOL_VERSION, "dir": "stop", "speed": 0, "ts": now_ms()})

    def send(self, msg: dict) -> bool:  # implementado por subclases
        raise NotImplementedError

    def close(self) -> None:
        self._stop.set()

    def _pump_loop(self) -> None:
        while not self._stop.is_set():
            time.sleep(DRIVE_REFRESH_S)
            with self._lock:
                hold, until = self._hold, self._hold_until
            if not hold:
                continue
            if time.time() >= until:
                self.stop()
                continue
            self.send({**hold, "ts": now_ms()})


class RobotLink(_BaseLink):
    """Cliente WebSocket real (ESP32-S3 en modo AP: ws://192.168.4.1:81)."""

    def __init__(self, url: str = DEFAULT_URL) -> None:
        super().__init__()
        self.url = url
        self._ws: websocket.WebSocketApp | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            self._ws = websocket.WebSocketApp(
                self.url,
                on_open=self._on_open,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
            )
            self._ws.run_forever()
            if not self._stop.is_set():
                time.sleep(1.5)  # reintento

    def _on_open(self, ws) -> None:
        with self._lock:
            self.connected = True
            self.last_error = ""
        self.log(f"Conectado a {self.url}")
        ws.send(json.dumps({"t": "hello", "v": PROTOCOL_VERSION}))
        ws.send(json.dumps({"t": "status", "v": PROTOCOL_VERSION}))

    def _on_message(self, _ws, raw) -> None:
        try:
            msg = json.loads(raw)
        except (ValueError, TypeError):
            return
        t = msg.get("t")
        if t in ("telemetry", "status"):
            with self._lock:
                self.telemetry = msg
                self.telemetry_rx_ms = now_ms()
        elif t == "event":
            self.log(f"Evento {msg.get('code')}: {msg.get('detail', '')}")
        elif t == "error":
            self.log(f"Error {msg.get('code')}: {msg.get('detail', '')}")
        elif t == "ack" and msg.get("of") != "drive":
            self.log(f"ACK {msg.get('of')} {msg.get('value', '')}".strip())

    def _on_error(self, _ws, err) -> None:
        with self._lock:
            self.last_error = str(err)

    def _on_close(self, *_args) -> None:
        was = self.connected
        with self._lock:
            self.connected = False
        if was:
            self.log("Conexión cerrada")

    def send(self, msg: dict) -> bool:
        ws = self._ws
        if not ws or not self.connected:
            return False
        try:
            ws.send(json.dumps(msg))
            return True
        except Exception as exc:  # noqa: BLE001 - se informa en la UI
            with self._lock:
                self.last_error = str(exc)
            return False

    def close(self) -> None:
        super().close()
        if self._ws:
            try:
                self._ws.close()
            except Exception:  # noqa: BLE001
                pass


class SimLink(_BaseLink):
    """Robot simulado: misma telemetria que el firmware (protocolo v1)."""

    COLORS = [("negro", [20, 20, 22]), ("blanco", [235, 235, 235]), ("rojo", [210, 40, 40]),
              ("amarillo", [230, 210, 40]), ("verde", [50, 180, 80]), ("azul", [40, 80, 210])]

    def __init__(self) -> None:
        super().__init__()
        self.connected = True
        self.mode = "idle"
        self.estop = False
        self.heading = 30.0
        self.target: float | None = None
        self.strategy: str | None = None
        self.left = self.right = 0
        self.nav = "IDLE"
        self._drive_ts = 0
        self._obst_until = 0.0
        self._t0 = time.time()
        self.log("Simulación iniciada (ningún comando llega al robot real)")
        threading.Thread(target=self._sim_loop, daemon=True).start()

    def send(self, msg: dict) -> bool:
        t = msg.get("t")
        with self._lock:
            if self.estop and t in ("drive", "mode", "heading"):
                self.events.appendleft(time.strftime("%H:%M:%S ") + "Error SAFETY: estop activo")
                return True
            if t == "mode":
                if msg["value"] == "autonomo" and msg.get("strategy") not in ("evadir", "rumbo", "linea"):
                    self.events.appendleft(time.strftime("%H:%M:%S ") + "Error BAD_FORMAT: falta mode.strategy")
                    return True
                self.mode = msg["value"]
                self.strategy = msg.get("strategy")
                self.left = self.right = 0
                if "deg" in msg:
                    self.target = float(msg["deg"])
                self.nav = "NAVEGAR" if self.mode == "autonomo" else "MANUAL"
            elif t == "heading":
                self.target = float(msg["deg"])
            elif t == "estop":
                self.estop, self.left, self.right, self.nav = True, 0, 0, "SAFE"
            elif t == "drive":
                if msg["dir"] == "stop" and self.mode == "autonomo":
                    self.mode, self.nav, self.left, self.right = "idle", "IDLE", 0, 0
                elif self.mode != "autonomo":
                    self.mode, self.nav = "manual", "MANUAL"
                    s = int(msg.get("speed", 60))
                    self.left, self.right = {"fwd": (s, s), "back": (-s, -s), "left": (-s, s),
                                             "right": (s, -s)}.get(msg["dir"], (0, 0))
                    self._drive_ts = now_ms()
        if t in ("mode", "heading", "estop"):
            self.log(f"ACK {t} {msg.get('value', msg.get('deg', ''))}".strip())
        return True

    def _sim_loop(self) -> None:
        dt = 0.1
        while not self._stop.is_set():
            time.sleep(dt)
            with self._lock:
                now = time.time()
                if self.mode == "manual" and now_ms() - self._drive_ts > 500:
                    self.left = self.right = 0  # deadman
                front_blocked = now < self._obst_until
                if self.mode == "autonomo" and not self.estop:
                    if random.random() < 0.01 and not front_blocked:
                        self._obst_until = now + 1.2
                        self.events.appendleft(time.strftime("%H:%M:%S ") + "Evento NAV_STATE: EVADIR")
                    if front_blocked:
                        self.nav, self.left, self.right = "EVADIR", 40, -40
                    elif self.strategy == "rumbo" and self.target is not None:
                        e = angle_error(self.target, self.heading)
                        if self.nav in ("EVADIR", "BORDEAR"):
                            self.nav = "REORIENTAR"
                        if self.nav == "REORIENTAR" and abs(e) <= 10:
                            self.nav = "NAVEGAR"
                        corr = max(-30, min(30, round(0.8 * e)))
                        self.left, self.right = 40 + corr, 40 - corr
                    else:
                        self.nav, self.left, self.right = "NAVEGAR", 40, 40
                self.heading = (self.heading + (self.left - self.right) * 0.06 * dt * 10
                                + random.uniform(-0.3, 0.3)) % 360.0
                self._publish(front_blocked)

    def _publish(self, front_blocked: bool) -> None:
        k = int((time.time() - self._t0) / 3) % len(self.COLORS)
        name, rgb = self.COLORS[k]
        wobble = 10 * math.sin(time.time())
        err = angle_error(self.target, self.heading) if self.target is not None else None
        self.telemetry = {
            "t": "telemetry", "v": 1, "ts": now_ms(), "mode": self.mode, "conn": True,
            "heading": {"valid": True, "actual": round(self.heading, 1),
                        "target": self.target, "error": None if err is None else round(err, 1)},
            "color": {"name": name, "valid": True, "rgb": rgb},
            "obstacle": {"valid": True, "distance_cm": 12.0 if front_blocked else round(60 + wobble, 1),
                         "blocked": front_blocked},
            "obstacle_left": {"valid": True, "distance_cm": round(45 + wobble, 1), "blocked": False},
            "obstacle_right": {"valid": True, "distance_cm": round(50 - wobble, 1), "blocked": False},
            "motors": {"left": self.left, "right": self.right,
                       "state": "moving" if (self.left or self.right) else "stopped"},
            "nav": {"state": self.nav, "level": 1,
                    "strategy": self.strategy if self.mode == "autonomo" else None},
            "estop": self.estop,
        }
        self.telemetry_rx_ms = now_ms()
