"""jarvis.py - Asistente tipo JARVIS (RF-09) para la app Streamlit.

Puerto a Python de app/shared/jarvis.js, ampliado con:
  - intencion "estado"/"variables": resume TODA la telemetria en vivo;
  - explicacion del rumbo polar, del estado de navegacion y de los colores;
  - trato "senor" al estilo JARVIS.
  - base de conocimiento TECNICA compartida con la app web
    (app/shared/jarvis_kb.js): circuito, alimentacion, pines, I2C, PWM,
    timers, interrupciones, sensores, WiFi, protocolo, seguridad, FSM...;
  - is_question()/confirm()/to_speech(): un solo boton "Hablar" para
    preguntar a JARVIS o dar ordenes al robot, con respuesta en voz alta.
Regla dura: NO inventa mediciones. Si un dato no esta, lo dice.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

_KB_FILE = Path(__file__).resolve().parents[1] / "shared" / "jarvis_kb.js"


def _load_kb() -> dict:
    """Lee el JSON entre los marcadores KB-JSON de jarvis_kb.js."""
    try:
        src = _KB_FILE.read_text(encoding="utf-8")
        start = src.index("/*KB-JSON-START*/") + len("/*KB-JSON-START*/")
        end = src.index("/*KB-JSON-END*/")
        return json.loads(src[start:end])
    except (OSError, ValueError):
        return {"topics": []}


KB = _load_kb()

KNOWLEDGE = {
    "proyecto": (
        "El proyecto es un robot móvil diferencial de dos ruedas gobernado por una ESP32-S3. "
        "Opera en modo manual, por botones o por voz, y en modo autónomo, donde mantiene "
        "un rumbo con la brújula digital, esquiva obstáculos y vuelve al rumbo deseado. "
        "Detecta seis colores de superficie y envía telemetría por WiFi y WebSocket a esta app."
    ),
    "hardware": (
        "Usa una ESP32-S3 N16R8, el driver de motores TB6612FNG, la brújula QMC5883L, el sensor "
        "de color TCS34725, tres sensores ultrasónicos HC-SR04 (frontal, izquierdo y derecho) "
        "y motores TT con encoder. Se alimenta con un banco Li-ion 3S."
    ),
    "autonomo": (
        "El modo autónomo tiene tres submodos: solo esquivar obstáculos, seguir un rumbo con la "
        "brújula esquivando, o seguir una línea de color esquivando y volviendo a ella."
    ),
    "colores": "Reconoce negro, blanco, rojo, amarillo, verde y azul con el sensor TCS34725 calibrado.",
    "polar": (
        "El gráfico polar muestra el norte arriba. La flecha cian es el rumbo actual que mide la "
        "brújula y la flecha ámbar es el rumbo deseado. El error es la diferencia angular más "
        "corta, entre -180 y 180 grados; si es positivo, el robot debe girar a la derecha."
    ),
    "comandos": ['"adelante"', '"atrás"', '"izquierda"', '"derecha"', '"detente"',
                 '"parada de emergencia"', '"modo manual"', '"modo autónomo"', '"rumbo 90"'],
}

NAV_EXPLAIN = {
    "NAVEGAR": "navegando hacia el rumbo deseado",
    "BUSCAR_LINEA": "buscando la línea de color",
    "EVADIR": "girando para esquivar un obstáculo frontal",
    "BORDEAR": "bordeando el obstáculo",
    "REORIENTAR": "volviendo al rumbo deseado tras la evasión",
    "VOLVER": "volviendo a la línea tras rodear un obstáculo",
    "ALINEAR": "alineándose con la línea",
    "RETROCEDER": "retrocediendo porque está encerrado",
    "MANUAL": "en control manual",
    "SAFE": "en estado seguro por la parada de emergencia",
    "IDLE": "detenido",
}

INTENTS: dict[str, list[str]] = {
    "identidad": ["quien eres", "como te llamas", "tu nombre", "eres jarvis"],
    "saludo": ["hola", "buenos dias", "buenas tardes", "buenas noches", "hey jarvis"],
    "estado": ["estado", "todas las variables", "variables", "resumen", "reporte",
               "telemetria", "que esta pasando", "como estas", "informe"],
    "polar": ["polar", "grafico", "flecha", "dial"],
    "autonomo": ["autonomo", "navegacion", "como esquiva", "evasion", "esquivar"],
    "proyecto": ["que es", "de que trata", "que hace", "proyecto", "cuentame", "explica"],
    "hardware": ["hardware", "componentes", "que usas", "con que esta hecho", "sensores tiene"],
    "emergencia": ["emergencia", "estop", "parada"],
    "rumbo": ["rumbo", "brujula", "orientacion", "direccion", "norte", "heading", "angulo"],
    "color": ["color", "colores", "superficie"],
    "distancia": ["distancia", "obstaculo", "que tan cerca", "lejos", "ultrasonido", "sensores"],
    "motores": ["motores", "motor", "velocidad", "potencia", "ruedas"],
    "modo": ["modo", "manual", "automatico"],
    "conexion": ["conexion", "conectado", "enlace", "wifi", "senal"],
    "ayuda": ["ayuda", "comandos", "que puedo decir", "instrucciones", "que sabes"],
    "gracias": ["gracias"],
}


def normalize(text: str | None) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFD", str(text).lower().strip())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r'[.,;:!?¡¿"]', " ", s)
    return re.sub(r"\s+", " ", s).strip()


def classify(question: str) -> str:
    s = normalize(question)
    for intent, words in INTENTS.items():
        if any(w in s for w in words):
            return intent
    return "desconocido"


def _num(x, dec: int = 1) -> str | None:
    if isinstance(x, (int, float)) and x == x:  # descarta NaN
        return f"{x:.{dec}f}"
    return None


def _heading(t: dict) -> str:
    h = t.get("heading") or {}
    actual = _num(h.get("actual"))
    if actual is None:
        return "No tengo lectura de rumbo: la brújula no da datos o no está calibrada."
    msg = f"El rumbo actual es {actual}°"
    if _num(h.get("target")) is not None:
        msg += f", el deseado es {_num(h['target'])}°"
    if _num(h.get("error")) is not None:
        e = h["error"]
        side = "derecha" if e > 0 else "izquierda" if e < 0 else "ningún lado"
        msg += f" y el error es {_num(e)}° (debe girar a la {side})" if e else " y el error es 0°"
    return msg + "."


def _color(t: dict) -> str:
    c = t.get("color") or {}
    if c.get("valid") and c.get("name"):
        rgb = c.get("rgb")
        extra = f" (RGB {rgb[0]}, {rgb[1]}, {rgb[2]})" if isinstance(rgb, list) and len(rgb) == 3 else ""
        return f"La superficie bajo el robot es {c['name']}{extra}."
    return "No tengo una lectura de color válida en este momento."


def _distances(t: dict) -> str:
    parts = []
    for key, label in (("obstacle", "frontal"), ("obstacle_left", "izquierdo"),
                       ("obstacle_right", "derecho")):
        o = t.get(key) or {}
        if o.get("valid") and _num(o.get("distance_cm")) is not None:
            parts.append(f"{label} {_num(o['distance_cm'])} cm{' (bloqueado)' if o.get('blocked') else ''}")
        else:
            parts.append(f"{label} sin eco")
    return "Sensores ultrasónicos: " + ", ".join(parts) + "."


def _motors(t: dict) -> str:
    m = t.get("motors")
    if not m:
        return "No tengo datos de los motores."
    return f"Motores: izquierdo {m.get('left')} %, derecho {m.get('right')} %, estado {m.get('state', 'desconocido')}."


def _nav(t: dict) -> str:
    state = ((t.get("nav") or {}).get("state")) or "IDLE"
    return f"Navegación: {state}, {NAV_EXPLAIN.get(state, 'estado sin descripción')}."


# --- Base tecnica ----------------------------------------------------------
LIVE_INTENTS = {"rumbo", "color", "distancia", "motores", "modo", "conexion", "emergencia", "estado"}
LIVE_MARKERS = ["actual", "ahora", "en este momento", "tengo", "marca", "esta midiendo",
                "estas", "esta el robot", "cuanto mide", "que lee", "que detecta ahora"]
TECH_MARKERS = ["como funciona", "como se", "como lee", "como mide", "como calcula",
                "como esta conectad", "como conect", "como detecta", "como controla", "como sabe",
                "como distingue", "como evita", "como se comunica", "por que", "porque", "para que",
                "que es", "que son", "explica", "explicame", "describe", "funciona", "conect", "pin",
                "gpio", "circuito", "calibr", "registro", "formula", "principio", "diferencia",
                "cada cuanto", "cuantos", "donde va", "a que", "hablame", "cuentame sobre", "detalle",
                "que pasa si", "que pasaria", "sirve", "conexiones", "cuales son"]


def _key_score(padded: str, keys: list[str]) -> int:
    """Igual que keyScore en jarvis.js: claves >= 5 letras como prefijo de
    palabra, cortas como palabra entera; una clave contenida en otra que
    tambien coincide no suma."""
    hits = [k for k in keys
            if (f" {k}" in padded if len(k) >= 5 else f" {k} " in padded)]
    score = 0
    for a in hits:
        if not any(b != a and len(b) > len(a) and a in b for b in hits):
            score += len(a.split(" "))
    return score


def search_kb(question: str) -> dict | None:
    padded = f" {normalize(question)} "
    best = None
    for tp in KB.get("topics", []):
        base = _key_score(padded, tp.get("keys", []))
        best_fact, best_fact_score = None, 0
        for fact in tp.get("facts", []):
            fs = _key_score(padded, fact.get("keys", []))
            if fs > best_fact_score:
                best_fact, best_fact_score = fact, fs
        use_fact = best_fact is not None and (base > 0 or best_fact_score >= 2)
        total = base + (best_fact_score * 2 if use_fact else 0)
        if total > 0 and (best is None or total > best["score"]):
            best = {"id": tp["id"], "score": total,
                    "text": best_fact["text"] if use_fact else tp["text"]}
    return best


# --- Pregunta u orden -------------------------------------------------------
_WAKE = re.compile(r"^(?:(?:oye|hey|hola|ok|okay)\s+)?jarvis\s*")
QUESTION_START = ["que", "como", "cual", "cuales", "cuanto", "cuanta", "cuantos", "cuantas",
                  "donde", "cuando", "por que", "porque", "para que", "quien", "quienes",
                  "explica", "explicame", "explicanos", "dime", "cuentame", "hablame", "describe",
                  "describeme", "sabes", "me explicas", "me dices", "puedes explicar", "podrias",
                  "hay", "es", "esta", "estas", "tiene", "tienes", "ayuda", "hola", "gracias",
                  "muchas gracias", "buenos dias", "buenas tardes", "buenas noches", "estado",
                  "cada cuanto", "en que", "con que", "de que", "a que", "necesito saber",
                  "quiero saber"]


def strip_wake(text: str | None) -> str:
    return _WAKE.sub("", normalize(text)).strip()


_SOFT_START = re.compile(r"^(hola|gracias|muchas gracias|ayuda|hay|es|esta|estas|estado|buen[oa]s \w+|podrias|puedes)\b")
_STOP_WORDS = re.compile(r"\b(detente|detener|para|parar|parate|alto|stop|frena|frenar|quieto|emergencia)\b")


def ask_auto(missing: str) -> str:
    """Lo que JARVIS pregunta cuando falta el submodo o el rumbo."""
    if missing == "heading":
        return "¿Qué rumbo quiere, en grados, o norte, sur, este u oeste?"
    return "¿Qué modo autónomo quiere: solo esquivar, seguir un rumbo o seguir la línea?"


def is_question(text: str | None) -> bool:
    """True si la frase es pregunta/conversacion (para JARVIS), no una orden."""
    if not text or not normalize(text):
        return False
    if re.search(r"[?¿]", str(text)):
        return True
    s = strip_wake(text)
    if _SOFT_START.search(s) and _STOP_WORDS.search(s):
        return False  # "ayuda, detente": manda la parada
    if not s:
        return True  # solo "Jarvis": saludo
    return any(s == w or s.startswith(w + " ") for w in QUESTION_START)


def confirm(cmd: dict | None) -> str:
    """Frase corta con la que JARVIS confirma una orden enviada al robot."""
    if not cmd:
        return "No entendí la orden."
    t = cmd.get("t")
    if t == "estop":
        return "Parada de emergencia activada, señor."
    if t == "mode":
        if cmd.get("value") != "autonomo":
            return "Modo manual activado."
        return {"evadir": "Modo autónomo: solo esquivo obstáculos.",
                "linea": "Modo autónomo: sigo la línea y esquivo obstáculos.",
                "rumbo": f"Modo autónomo: rumbo {round(cmd.get('deg', 0))} grados, esquivando obstáculos.",
                }.get(cmd.get("strategy"), "Modo autónomo activado.")
    if t == "heading":
        return f"Rumbo deseado fijado en {round(cmd.get('deg', 0))} grados."
    if t == "drive":
        if cmd.get("dir") == "stop":
            return "Detenido."
        if cmd.get("until") == "front_obstacle":
            return f"Avanzando hasta encontrar un obstáculo a {cmd.get('stop_cm', 10)} centímetros."
        return {"fwd": "Avanzando.", "back": "Retrocediendo.", "left": "Girando a la izquierda.",
                "right": "Girando a la derecha."}.get(cmd.get("dir"), "Orden enviada.")
    return "Orden enviada."


_SPEECH_RULES = [
    (r"(\d)\s*°", r"\1 grados"), (r"°", " grados"), (r"(\d)\s*%", r"\1 por ciento"),
    (r"(\d)\s*µs\b", r"\1 microsegundos"), (r"(\d)\s*us\b", r"\1 microsegundos"),
    (r"(\d)\s*ms\b", r"\1 milisegundos"), (r"(\d)\s*kHz\b", r"\1 kilohercios"),
    (r"(\d)\s*MHz\b", r"\1 megahercios"), (r"(\d)\s*GHz\b", r"\1 gigahercios"),
    (r"(\d)\s*Hz\b", r"\1 hercios"), (r"(\d)\s*µF\b", r"\1 microfaradios"),
    (r"(\d)\s*nF\b", r"\1 nanofaradios"), (r"(\d)\s*kΩ", r"\1 kiloohmios"), (r"(\d)\s*Ω", r"\1 ohmios"),
    (r"(\d)\s*cm\b", r"\1 centímetros"), (r"(\d)\s*mA\b", r"\1 miliamperios"),
    (r"(\d)\s*MB\b", r"\1 megabytes"), (r"(\d)\s*V\b", r"\1 voltios"), (r"(\d)\s*s\b", r"\1 segundos"),
    (r"I²C|I2C", "I dos C"), (r"\bGPIO\b", "G P I O"), (r"\bPWM\b", "P W M"), (r"\bJSON\b", "yeison"),
    (r"ws://", ""), (r"->|→", " a "), (r'["_*]', " "),
]


def to_speech(text: str | None) -> str:
    """Texto adaptado a la sintesis de voz (unidades y siglas legibles)."""
    s = str(text or "")
    s = re.sub(r"0x([0-9A-Fa-f]+)", lambda m: "cero equis " + " ".join(m.group(1)), s)
    for pat, rep_ in _SPEECH_RULES:
        s = re.sub(pat, rep_, s)
    return re.sub(r"\s+", " ", s).strip()


def answer(question: str, t: dict | None, connected: bool | None = None) -> str:
    """Respuesta de JARVIS. `t` es la ultima telemetria (o None)."""
    t = t or {}
    only_name = bool(normalize(question)) and not strip_wake(question)
    question = strip_wake(question) or question
    intent = "saludo" if only_name else classify(question)
    live = bool(t)
    s = normalize(question)

    # La base tecnica gana si la pregunta es de funcionamiento/diseno, si no
    # encaja en ninguna intencion simple o si nombra varios conceptos tecnicos.
    asks_live = intent in LIVE_INTENTS and any(m in s for m in LIVE_MARKERS)
    kb = None if (asks_live or only_name) else search_kb(question)
    if kb and (any(m in s for m in TECH_MARKERS) or intent == "desconocido" or kb["score"] >= 2):
        return kb["text"]

    if intent == "identidad":
        return "Soy JARVIS, el asistente del robot. Explico el proyecto y leo la telemetría en tiempo real, señor."
    if intent == "saludo":
        return "A su servicio, señor. Pregúnteme por el estado, el rumbo, el color, los obstáculos o los motores."
    if intent == "proyecto":
        return KNOWLEDGE["proyecto"]
    if intent == "hardware":
        return KNOWLEDGE["hardware"]
    if intent == "autonomo":
        return KNOWLEDGE["autonomo"] + (" " + _nav(t) if live else "")
    if intent == "polar":
        return KNOWLEDGE["polar"] + (" " + _heading(t) if live else "")
    if intent == "estado":
        if not live:
            return "Aún no recibo telemetría, señor. Conecte el robot o active la simulación."
        return " ".join([
            f"Modo {t.get('mode', 'desconocido')}.", _nav(t), _heading(t), _color(t),
            _distances(t), _motors(t),
            "Parada de emergencia ACTIVA." if t.get("estop") else "Parada de emergencia inactiva.",
        ])
    if intent == "emergencia":
        if "estop" in t:
            return "La parada de emergencia está ACTIVA." if t["estop"] else "La parada de emergencia está inactiva."
        return 'Diga "parada de emergencia" para detener el robot de inmediato.'
    if intent == "rumbo":
        return _heading(t)
    if intent == "color":
        return _color(t) + " " + KNOWLEDGE["colores"]
    if intent == "distancia":
        return _distances(t) if live else "No tengo lecturas de distancia."
    if intent == "motores":
        return _motors(t)
    if intent == "modo":
        return f"El modo actual es {t['mode']}. {_nav(t)}" if t.get("mode") else "No tengo el modo actual."
    if intent == "conexion":
        if connected is True:
            return "El robot está conectado y enviando telemetría."
        if connected is False:
            return "El robot NO está conectado."
        return "No tengo información de la conexión."
    if intent == "ayuda":
        return ("Puedo explicar el proyecto y su parte técnica: alimentación y batería, conexiones y "
                "pines, driver y PWM de los motores, timers e interrupciones, bus I2C, brújula, sensor "
                "de color, ultrasonidos, encoders, WiFi, protocolo WebSocket, seguridad, máquina de "
                "estados y navegación autónoma. También leo el estado completo, el rumbo, el color, las "
                "distancias, los motores, el modo y la conexión. "
                "Órdenes de voz: " + ", ".join(KNOWLEDGE["comandos"]) + ".")
    if intent == "gracias":
        return "Siempre a su disposición, señor."
    return ('No estoy seguro de eso, señor. Pregúnteme por el circuito, los pines, la comunicación, '
            'los timers o los sensores, por el "estado" completo o por una variable (rumbo, color, '
            'distancia, motores, modo, conexión). Diga "ayuda" para más.')
