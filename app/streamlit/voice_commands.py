"""voice_commands.py - Texto/voz -> comando del protocolo v1 (RF-02).

Puerto a Python de app/shared/commands.js (mismas reglas y vocabulario). Es
logica pura: no reconoce audio, solo interpreta el TEXTO ya reconocido.
"""
from __future__ import annotations

import re
import time
import unicodedata

PROTOCOL_VERSION = 1
DRIVE_MAX_MS_DEFAULT = 8000
DRIVE_MAX_MS_MAX = 15000

WORDS = {
    "estop": ["parada de emergencia", "emergencia", "emergency", "emergencia total",
              "frenado de emergencia", "detener todo", "para todo"],
    "stop": ["detente", "detener", "parar", "para", "alto", "stop", "frena", "frenar",
             "detenerse", "quieto", "quieta", "parate"],
    "forward": ["adelante", "avanza", "avanzar", "avanzando", "sigue", "seguir", "frente",
                "recto", "derecho", "forward", "ve hacia adelante", "muevete hacia adelante", "camina"],
    "back": ["atras", "retrocede", "retroceder", "retrocediendo", "reversa", "back", "reverse",
             "ve hacia atras", "muevete hacia atras", "echa para atras"],
    "left": ["izquierda", "left", "gira a la izquierda", "gira izquierda", "rota izquierda",
             "voltea a la izquierda"],
    "right": ["derecha", "right", "gira a la derecha", "gira derecha", "rota derecha",
              "voltea a la derecha"],
    "manual": ["modo manual", "manual", "control manual"],
    "auto": ["modo autonomo", "autonomo", "automatico", "modo automatico", "piloto automatico", "automatic"],
}

SPEED_WORDS = [
    (["lento", "lenta", "despacio", "suave", "slow"], 30),
    (["medio", "media", "normal", "moderado", "moderada"], 60),
    (["rapido", "rapida", "fuerte", "veloz", "fast"], 85),
]

_NEGATION = re.compile(
    r"(^|\s)(no|nunca|sin)\s+(avanza|avances|avance|avanzar|retrocede|retrocedas|retroceda|"
    r"retroceder|gira|gires|gire|girar|para|pares|pare|parar|detente|detengas|detenga|detener|"
    r"frena|frenes|frene|frenar|sigue|muevas|mover|vayas|ir)\b")

_NUMBER_WORDS = {
    "cero": 0, "norte": 0, "este": 90, "sur": 180, "oeste": 270,
}


def normalize(text: str | None) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFD", str(text).lower().strip())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r'[.,;:!?¡¿"]', " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _contains_phrase(s: str, phrase: str) -> bool:
    if " " in phrase:
        return phrase in s
    return re.search(r"(^|\s)" + re.escape(phrase) + r"(\s|$)", s) is not None


def _any(s: str, words: list[str]) -> bool:
    return any(_contains_phrase(s, w) for w in words)


def _speed(s: str) -> tuple[int, bool]:
    m = re.search(r"(\d{1,3})\s*(?:%|por ciento|porciento)", s)
    if m and 0 <= int(m.group(1)) <= 100:
        return int(m.group(1)), True
    for words, value in SPEED_WORDS:
        if _any(s, words):
            return value, True
    return 60, False


_NUM_WORDS = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12,
    "trece": 13, "catorce": 14, "quince": 15, "dieciseis": 16, "diecisiete": 17,
    "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiun": 21, "veintiuno": 21,
    "veintiuna": 21, "veintidos": 22, "veintitres": 23, "veinticuatro": 24,
    "veinticinco": 25, "veintiseis": 26, "veintisiete": 27, "veintiocho": 28,
    "veintinueve": 29, "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
    "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100,
}


def numbers_to_digits(s: str) -> str:
    """'cinco segundos' -> '5 segundos'; 'treinta y cinco' -> '35' (igual que commands.js)."""
    t, out, i = s.split(), [], 0
    while i < len(t):
        v = _NUM_WORDS.get(t[i])
        if v is None:
            out.append(t[i])
        else:
            if 30 <= v < 100 and v % 10 == 0 and i + 2 < len(t) and t[i + 1] == "y":
                u = _NUM_WORDS.get(t[i + 2])
                if u is not None and 1 <= u <= 9:
                    v += u
                    i += 2
            out.append(str(v))
        i += 1
    return " ".join(out)


def _duration_ms(s: str) -> int:
    m = re.search(r"(?:por|durante)?\s*(\d{1,2})\s*(?:segundos|segundo|seg|s)\b", s)
    if m and int(m.group(1)) > 0:
        return max(500, min(int(m.group(1)) * 1000, 15000))
    return 0


def _stop_cm(s: str) -> int:
    m = re.search(r"(?:a|hasta)?\s*(\d{1,2})\s*(?:cm|centimetros|centimetro)\b", s)
    if m and int(m.group(1)) > 0:
        return max(5, min(int(m.group(1)), 30))   # rango del protocolo
    return 10


def _heading_target(s: str) -> float | None:
    """'rumbo 90', 'orientate a 270 grados', 'rumbo norte' -> grados."""
    if not re.search(r"\b(rumbo|orientate|orienta|apunta|direccion|heading)\b", s):
        return None
    m = re.search(r"(\d{1,3})(?:\s*grados?)?", s)
    if m and 0 <= int(m.group(1)) < 360:
        return float(m.group(1))
    for word, deg in _NUMBER_WORDS.items():
        if _contains_phrase(s, word):
            return float(deg)
    return None


def _drive(direction: str, speed: int, **opts) -> dict:
    m = {"t": "drive", "v": PROTOCOL_VERSION, "dir": direction, "speed": speed,
         "ts": int(time.time() * 1000)}
    m.update(opts)
    return m


# --- Submodos del modo autonomo (mismas reglas que commands.js) --------------
_CARDINALS = {"norte": 0, "noreste": 45, "este": 90, "oriente": 90, "sureste": 135, "sur": 180,
              "suroeste": 225, "oeste": 270, "occidente": 270, "noroeste": 315}
_HUNDREDS = {"ciento": 100, "doscientos": 200, "trescientos": 300}


def parse_degrees(s: str) -> float | None:
    m = re.search(r"\d+", s)
    deg = int(m.group(0)) if m else None
    if deg is None:
        t = numbers_to_digits(s).split()
        for i, w in enumerate(t):
            nxt = t[i + 1] if i + 1 < len(t) else ""
            if w in _HUNDREDS:
                deg = _HUNDREDS[w] + (int(nxt) if nxt.isdigit() else 0)
                break
            if w.isdigit() and not (w == "1" and nxt):   # "un rumbo de noventa"
                deg = int(w)
                break
        if deg is None:
            deg = next((_CARDINALS[w] for w in t if w in _CARDINALS), None)
    return float(deg) if deg is not None and 0 <= deg < 360 else None


def _strategy_in(s: str) -> str | None:
    if re.search(r"\blineas?\b", s):
        return "linea"
    if re.search(r"\b(rumbo|brujula)\b", s):
        return "rumbo"
    if re.search(r"\b(esquiv|evad|evas|evit)", s):
        return "evadir"
    return None


def auto_command(strategy: str | None, deg: float | None = None) -> dict:
    """Sin strategy (o rumbo sin deg) la orden esta incompleta: la app pregunta."""
    cmd = {"t": "mode", "v": PROTOCOL_VERSION, "value": "autonomo"}
    if strategy:
        cmd["strategy"] = strategy
    if strategy == "rumbo" and deg is not None:
        cmd["deg"] = deg
    return cmd


def _is_auto_request(s: str) -> bool:
    return bool(_any(s, WORDS["auto"]) or re.search(r"\b(esquiv|evad|evit)", s)
                or (re.search(r"\blineas?\b", s) and re.search(r"\b(sig[aou]|segu)", s)))


def auto_reply(text: str | None, pending: str) -> dict | None:
    """Respuesta a "que submodo?" (pending='strategy') o "que rumbo?" ('heading')."""
    s = normalize(text)
    if (not s or re.search(r"\b(no|nunca)\b", s) or _any(s, WORDS["stop"])
            or _any(s, WORDS["estop"]) or _any(s, WORDS["manual"])):
        return None
    st = _strategy_in(s)
    deg = parse_degrees(s)
    if pending == "heading" and st in (None, "rumbo"):
        return None if deg is None else auto_command("rumbo", deg)
    return auto_command(st, deg) if st else None


def missing_for(cmd: dict | None) -> str | None:
    """Que falta para enviar un modo: 'strategy' | 'heading' | None."""
    if not cmd or cmd.get("t") != "mode" or cmd.get("value") != "autonomo":
        return None
    if not cmd.get("strategy"):
        return "strategy"
    return "heading" if cmd["strategy"] == "rumbo" and "deg" not in cmd else None


def from_text(text: str | None) -> dict | None:
    """Devuelve el comando del protocolo, o None si no se entiende.

    El campo extra `_voice` (no se envia) lleva metadatos: duracion `max_ms`.
    """
    s = normalize(text)
    if not s or _NEGATION.search(s):
        return None

    sn = numbers_to_digits(s)   # "cinco segundos" -> "5 segundos"
    speed, explicit = _speed(sn)
    duration = _duration_ms(sn)

    def mark(cmd: dict, **meta) -> dict:
        cmd["_voice"] = {"raw": text, "normalized": s, **meta}
        return cmd

    if _any(s, WORDS["estop"]):
        return mark({"t": "estop", "v": PROTOCOL_VERSION})
    if _any(s, WORDS["stop"]):
        return mark(_drive("stop", 0))

    if _is_auto_request(s) and not _any(s, WORDS["manual"]):
        if re.search(r"\b(no|nunca)\b", s):
            return None
        return mark(auto_command(_strategy_in(s), parse_degrees(s)))

    target = _heading_target(s)
    if target is not None:
        return mark({"t": "heading", "v": PROTOCOL_VERSION, "deg": target})

    fwd, back = _any(s, WORDS["forward"]), _any(s, WORDS["back"])
    left, right = _any(s, WORDS["left"]), _any(s, WORDS["right"])
    moving = fwd or back or left or right
    if _any(s, WORDS["manual"]) and not moving:
        return mark({"t": "mode", "v": PROTOCOL_VERSION, "value": "manual"})

    # Avanzar por voz SIEMPRE se detiene ante un obstaculo frontal (10 cm por
    # defecto o lo que se diga); sin duracion dicha, tope de seguridad de 15 s.
    if fwd:
        stop_cm = _stop_cm(sn)
        max_ms = duration or DRIVE_MAX_MS_MAX
        return mark(_drive("fwd", speed, until="front_obstacle", stop_cm=stop_cm, max_ms=max_ms),
                    max_ms=max_ms)
    if back:
        return mark(_drive("back", speed), max_ms=duration or None)
    if left:
        return mark(_drive("left", speed if explicit else 50), max_ms=duration or None)
    if right:
        return mark(_drive("right", speed if explicit else 50), max_ms=duration or None)
    return None


def describe(cmd: dict | None) -> str:
    if not cmd:
        return "desconocido"
    t = cmd.get("t")
    if t == "drive":
        names = {"fwd": "avanzar", "back": "retroceder", "left": "girar a la izquierda",
                 "right": "girar a la derecha", "stop": "detener"}
        extra = ""
        if cmd.get("until") == "front_obstacle":
            extra = f" hasta obstáculo frontal <= {cmd.get('stop_cm', 10)} cm"
        return f"mover: {names.get(cmd['dir'], cmd['dir'])} ({cmd['speed']}%){extra}"
    if t == "estop":
        return "parada de emergencia"
    if t == "mode":
        deg = f" {cmd['deg']:.0f}°" if "deg" in cmd else ""
        return f"modo {cmd['value']}" + {"evadir": " (solo esquivar)", "linea": " (línea)",
                                         "rumbo": f" (rumbo{deg})"}.get(cmd.get("strategy"), "")
    if t == "heading":
        return f"rumbo deseado {cmd['deg']:.0f}°"
    return str(t)


def wire(cmd: dict) -> dict:
    """Copia del comando sin metadatos locales (lo que viaja por WebSocket)."""
    return {k: v for k, v in cmd.items() if not k.startswith("_")}
