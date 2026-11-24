"""Panel de control del robot ESP32-S3 en Streamlit (RF-02, RF-04, RF-07, RF-08, RF-09).

Ejecutar (desde la raiz del repo):
    python -m streamlit run app/streamlit/app.py

- Conectese a la WiFi del robot (AP "robot-esp32s3") y use ws://192.168.4.1:81,
  o elija "Simulación" para probar sin placa.
- La voz usa el reconocimiento del navegador: abra la app en localhost (o HTTPS).
"""
from __future__ import annotations

import json
import math

import plotly.graph_objects as go
import streamlit as st

import jarvis
import voice_commands as vc
from robot_link import DEFAULT_URL, RobotLink, SimLink, now_ms

try:
    from streamlit_mic_recorder import speech_to_text
except ImportError:  # la app funciona sin voz
    speech_to_text = None

st.set_page_config(page_title="Robot ESP32-S3", page_icon="🤖", layout="wide")

COLOR_HEX = {"negro": "#1b1b1f", "blanco": "#f2f2f2", "rojo": "#d62828", "amarillo": "#f2c80f",
             "verde": "#2a9d4b", "azul": "#2156d6"}

ss = st.session_state
ss.setdefault("link", None)
ss.setdefault("chat", [{"role": "assistant",
                        "content": "JARVIS en línea. Pregúnteme por el proyecto o por el estado del robot, señor."}])
ss.setdefault("speak", None)
ss.setdefault("last_voice", "")
ss.setdefault("auto_pending", None)   # None | "strategy" | "heading": falta elegir submodo

AUTO_LABELS = {"evadir": "Solo esquivar obstáculos", "rumbo": "Seguir un rumbo y esquivar",
               "linea": "Seguir una línea y esquivar"}


def link():
    return ss.link


# ---------------------------------------------------------------------------
# Conexion
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("Conexión")
    source = st.radio("Fuente", ["Robot (WebSocket)", "Simulación"], horizontal=True)
    url = st.text_input("URL del robot", DEFAULT_URL, disabled=source == "Simulación")
    c1, c2 = st.columns(2)
    if c1.button("Conectar", width="stretch", type="primary"):
        if ss.link:
            ss.link.close()
        ss.link = SimLink() if source == "Simulación" else RobotLink(url)
    if c2.button("Desconectar", width="stretch", disabled=ss.link is None):
        ss.link.close()
        ss.link = None

    st.divider()
    st.subheader("Velocidad manual")
    speed = st.slider("Potencia (%)", 20, 100, 50, 5)
    duration = st.slider("Duración de cada pulsación (s)", 0.3, 5.0, 1.0, 0.1)
    st.caption("El robot se detiene solo (deadman de 500 ms) si deja de recibir órdenes.")
    st.divider()
    tts = st.toggle("JARVIS responde en voz alta", value=True)


def execute(cmd: dict | None, origin: str) -> str:
    """Envia un comando (de botones, voz o texto). Devuelve un texto de resultado."""
    lk = link()
    if cmd is None:
        return "No entendí el comando."
    if lk is None:
        return "Sin conexión: pulse Conectar."
    desc = vc.describe(cmd)
    ss.auto_pending = None
    if cmd["t"] == "mode":
        lk.clear_hold()   # que el stop de un movimiento anterior no cancele el modo
    if cmd["t"] == "drive" and cmd["dir"] != "stop":
        meta = cmd.get("_voice") or {}
        ms = meta.get("max_ms") or int(duration * 1000)
        extra = {k: cmd[k] for k in ("until", "stop_cm", "max_ms") if k in cmd}
        lk.drive_for(cmd["dir"], cmd["speed"], ms, **extra)
    elif cmd["t"] == "drive":
        lk.stop()
    else:
        if cmd["t"] == "estop":
            lk.stop()
        lk.send(vc.wire(cmd))
    lk.log(f"[{origin}] {desc}")
    return desc


# ---------------------------------------------------------------------------
# Graficos
# ---------------------------------------------------------------------------
def polar_figure(t: dict | None) -> go.Figure:
    h = (t or {}).get("heading") or {}
    actual, target = h.get("actual"), h.get("target")
    fig = go.Figure()
    if isinstance(target, (int, float)):
        fig.add_trace(go.Scatterpolar(r=[0, 1], theta=[target, target], mode="lines+markers",
                                      line=dict(color="#f59e0b", width=5, dash="dot"),
                                      marker=dict(size=[0, 14], symbol="diamond"),
                                      name=f"Deseado {target:.0f}°"))
    if isinstance(actual, (int, float)):
        fig.add_trace(go.Scatterpolar(r=[0, 1], theta=[actual, actual], mode="lines+markers",
                                      line=dict(color="#06b6d4", width=7),
                                      marker=dict(size=[0, 16], symbol="triangle-up"),
                                      name=f"Actual {actual:.1f}°"))
        if isinstance(target, (int, float)):
            err = ((target - actual + 540) % 360) - 180
            n = max(2, int(abs(err) / 3))
            arc = [actual + err * i / n for i in range(n + 1)]
            fig.add_trace(go.Scatterpolar(r=[0.55] * len(arc), theta=arc, mode="lines",
                                          line=dict(color="#ef4444", width=3),
                                          name=f"Error {err:+.1f}°"))
    fig.update_layout(
        polar=dict(
            angularaxis=dict(rotation=90, direction="clockwise", tickmode="array",
                             tickvals=[0, 45, 90, 135, 180, 225, 270, 315],
                             ticktext=["N", "NE", "E", "SE", "S", "SO", "O", "NO"]),
            radialaxis=dict(visible=False, range=[0, 1.05]),
        ),
        showlegend=True, legend=dict(orientation="h", y=-0.08),
        margin=dict(l=30, r=30, t=20, b=20), height=380, uirevision="polar",
    )
    return fig


def fmt(v, unit="", dec=1) -> str:
    return f"{v:.{dec}f}{unit}" if isinstance(v, (int, float)) and not math.isnan(v) else "—"


# ---------------------------------------------------------------------------
# Panel en tiempo real (se refresca solo cada 0,4 s)
# ---------------------------------------------------------------------------
st.title("🤖 Robot móvil ESP32-S3")


@st.fragment(run_every=0.4)
def live_panel() -> None:
    lk = link()
    if lk is None:
        st.info("Pulse **Conectar** en la barra lateral (robot real o simulación).")
        return
    t, connected, events = lk.snapshot()
    stale = lk.telemetry_rx_ms and now_ms() - lk.telemetry_rx_ms > 2000

    left, right = st.columns([1.1, 1])
    with left:
        st.subheader("Dirección polar")
        st.plotly_chart(polar_figure(t), width="stretch", key="polar")
    with right:
        st.subheader("Telemetría en vivo")
        if not connected:
            st.warning(f"Sin conexión con el robot. {getattr(lk, 'last_error', '')}")
        elif stale or t is None:
            st.warning("Conectado, pero sin telemetría reciente.")
        t = t or {}
        h = t.get("heading") or {}
        nav = (t.get("nav") or {}).get("state", "—")
        a, b, c = st.columns(3)
        a.metric("Rumbo actual", fmt(h.get("actual"), "°"))
        b.metric("Rumbo deseado", fmt(h.get("target"), "°"))
        c.metric("Error", fmt(h.get("error"), "°"))
        a, b, c = st.columns(3)
        strategy = (t.get("nav") or {}).get("strategy")
        a.metric("Modo", str(t.get("mode", "—")).upper() + (f" · {strategy}" if strategy else ""))
        b.metric("Navegación", nav)
        c.metric("E-STOP", "ACTIVO" if t.get("estop") else "inactivo")

        col = t.get("color") or {}
        name = col.get("name", "—") if col.get("valid") else "sin lectura"
        swatch = COLOR_HEX.get(col.get("name"), "#888")
        st.markdown(
            f"**Superficie:** <span style='display:inline-block;width:1.1em;height:1.1em;"
            f"border-radius:3px;border:1px solid #999;background:{swatch};vertical-align:middle'></span> "
            f"**{name}**  ·  RGB {col.get('rgb', '—')}", unsafe_allow_html=True)

        a, b, c = st.columns(3)
        for colm, key, label in ((a, "obstacle_left", "Izquierda"), (b, "obstacle", "Frente"),
                                 (c, "obstacle_right", "Derecha")):
            o = t.get(key) or {}
            val = fmt(o.get("distance_cm"), " cm") if o.get("valid") else "sin eco"
            colm.metric(label + (" ⛔" if o.get("blocked") else ""), val)
        m = t.get("motors") or {}
        a, b = st.columns(2)
        a.metric("Motor izquierdo", f"{m.get('left', '—')} %")
        b.metric("Motor derecho", f"{m.get('right', '—')} %")

    with st.expander("Registro de eventos", expanded=False):
        st.code("\n".join(events) or "(vacío)", language=None)
    with st.expander("Telemetría JSON (cruda)"):
        st.json(t or {}, expanded=False)


live_panel()

# ---------------------------------------------------------------------------
# Control
# ---------------------------------------------------------------------------
st.divider()
ctl, voice_col, chat_col = st.columns([1, 1, 1.3])

with ctl:
    st.subheader("Control")
    m1, m2 = st.columns(2)
    if m1.button("🕹️ Manual", width="stretch"):
        st.toast(execute({"t": "mode", "v": 1, "value": "manual"}, "botón"))
    if m2.button("🧭 Autónomo", width="stretch"):
        ss.auto_pending = "strategy"
    if ss.auto_pending:
        with st.container(border=True):
            st.markdown("**Modo autónomo: ¿qué debe hacer?**")
            # Por voz ya se eligio rumbo y solo falta el angulo: preseleccionado.
            strat = st.radio("Submodo", list(AUTO_LABELS), format_func=AUTO_LABELS.get,
                             index=1 if ss.auto_pending == "heading" else None,
                             key=f"auto_strat_{ss.auto_pending}", label_visibility="collapsed")
            auto_deg = None
            if strat == "rumbo":
                auto_deg = st.number_input("Rumbo (grados)", 0, 359, value=None, step=5, key="auto_deg")
            elif strat == "linea":
                st.caption("Cualquier color menos blanco. Rodea el obstáculo y vuelve a la línea.")
            g1, g2 = st.columns(2)
            ready = strat is not None and (strat != "rumbo" or auto_deg is not None)
            if g1.button("Iniciar", type="primary", width="stretch", disabled=not ready):
                cmd_auto = vc.auto_command(strat, None if auto_deg is None else float(auto_deg))
                st.toast(execute(cmd_auto, "botón"))
                st.rerun()
            if g2.button("Cancelar", width="stretch"):
                ss.auto_pending = None
                st.rerun()

    pad = [["", "fwd", ""], ["left", "stop", "right"], ["", "back", ""]]
    icons = {"fwd": "⬆️", "back": "⬇️", "left": "⬅️", "right": "➡️", "stop": "⏹️"}
    for r, row in enumerate(pad):
        cols = st.columns(3)
        for ci, d in enumerate(row):
            if d and cols[ci].button(icons[d], key=f"pad_{d}", width="stretch"):
                spd = speed if d in ("fwd", "back") else max(30, speed - 10)
                st.toast(execute({"t": "drive", "v": 1, "dir": d, "speed": 0 if d == "stop" else spd}, "botón"))

    st.markdown("**Rumbo deseado** (modo autónomo)")
    hc1, hc2 = st.columns([2, 1])
    deg = hc1.number_input("Grados", 0, 359, 90, 5, label_visibility="collapsed")
    if hc2.button("Fijar", width="stretch"):
        st.toast(execute({"t": "heading", "v": 1, "deg": float(deg)}, "botón"))
    qs = st.columns(4)
    for col, (lbl, d) in zip(qs, (("N", 0), ("E", 90), ("S", 180), ("O", 270))):
        if col.button(lbl, key=f"q_{lbl}", width="stretch"):
            st.toast(execute({"t": "heading", "v": 1, "deg": float(d)}, "botón"))

    if st.button("🛑 PARADA DE EMERGENCIA", type="primary", width="stretch"):
        st.toast(execute({"t": "estop", "v": 1}, "botón"))

def handle_utterance(text: str, origin: str) -> None:
    """Un solo canal para voz y texto: si es pregunta responde JARVIS; si es
    orden se envia al robot. JARVIS contesta siempre en el chat y en voz alta."""
    text = (text or "").strip()
    if not text:
        return
    cmd = None
    if not jarvis.is_question(text):
        spoken = jarvis.strip_wake(text)
        if ss.auto_pending:
            cmd = vc.auto_reply(spoken, ss.auto_pending)
        cmd = cmd or vc.from_text(spoken)
    missing = vc.missing_for(cmd)
    if missing:
        ss.auto_pending = missing
        reply = jarvis.ask_auto(missing)
        ss.last_voice = f'"{text}" → falta elegir submodo o rumbo'
    elif cmd is not None:
        result = execute(cmd, origin)
        ok = result == vc.describe(cmd)
        reply = jarvis.confirm(cmd) if ok else f"No pude ejecutar la orden: {result}"
        ss.last_voice = f'"{text}" → {result}'
    else:
        lk = link()
        t, connected, _ = lk.snapshot() if lk else (None, None, [])
        reply = jarvis.answer(text, t, connected)
        ss.last_voice = f'"{text}" → pregunta para JARVIS'
    ss.chat += [{"role": "user", "content": text}, {"role": "assistant", "content": reply}]
    ss.speak = reply if tts else None


with voice_col:
    st.subheader("Hablar con JARVIS")
    st.caption('Pulse Hablar y pregunte (p. ej. "¿cómo funciona el PWM?", "¿qué pines usa el driver?", '
               '"¿cada cuánto se leen los sensores?") o dé una orden ("adelante rápido 2 segundos", '
               '"modo autónomo", "rumbo 90", "parada de emergencia").')
    heard = None
    if speech_to_text is not None:
        heard = speech_to_text(language="es-ES", start_prompt="🎙️ Hablar", stop_prompt="⏺️ Detener",
                               just_once=True, use_container_width=True, key="stt_cmd")
    else:
        st.info("Instale `streamlit-mic-recorder` para usar el micrófono.")
    if heard:
        handle_utterance(heard, "voz")
        st.rerun()
    if ss.last_voice:
        st.success(ss.last_voice)

with chat_col:
    st.subheader("JARVIS")
    box = st.container(height=330)
    for msg in ss.chat[-12:]:
        box.chat_message(msg["role"], avatar="🤖" if msg["role"] == "assistant" else "🧑").write(msg["content"])
    q = st.chat_input("Pregunte o dé una orden (p. ej. «¿qué es el deadman?», «avanza»)")
    if q:
        handle_utterance(q, "texto")
        st.rerun()

if ss.speak:
    # Voz de JARVIS (speechSynthesis del navegador). El texto va como JSON con
    # "<" escapado para que no pueda cerrar la etiqueta <script>. Se trocea por
    # frases (Chrome corta los enunciados largos) y se elige una voz en espanol.
    spoken = json.dumps(jarvis.to_speech(ss.speak)).replace("<", "\\u003c")
    st.iframe(
        "<script>(function(){var W=window.parent,S=W.speechSynthesis,U=W.SpeechSynthesisUtterance;"
        "if(!S||!U)return;var txt=" + spoken + ",done=false;"
        "var parts=txt.match(/[^.!?;]+[.!?;]*/g)||[txt];"
        "function go(){if(done)return;done=true;"
        "var vs=S.getVoices().filter(function(v){return /^es/i.test(v.lang)});"
        "var pref=['es-CO','es-MX','es-US','es-ES'],v=null;"
        "for(var i=0;i<pref.length&&!v;i++)v=vs.filter(function(x){return x.lang===pref[i]})[0]||null;"
        "v=v||vs[0]||null;S.cancel();parts.forEach(function(p){p=p.trim();if(!p)return;"
        "var u=new U(p);u.lang=v?v.lang:'es-ES';if(v)u.voice=v;u.rate=1.05;u.pitch=0.9;S.speak(u);});}"
        "if(S.getVoices().length)go();else{S.onvoiceschanged=go;setTimeout(go,400);}})();</script>",
        height=1)
    ss.speak = None
