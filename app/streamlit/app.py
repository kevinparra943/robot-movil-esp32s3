"""App Streamlit del robot ESP32-S3 con la interfaz de app/web/v2.

Streamlit sirve la interfaz v2 tal cual (mismo HTML, CSS, JS y fuentes) dentro
de un iframe. Todo se lee de los archivos originales en cada cambio, así que
editar app/web/v2 o app/shared se refleja aquí sin tocar este archivo.

La interfaz habla con el robot directamente desde el navegador por WebSocket
(ws://192.168.4.1:81), incluye voz, gráfico de rumbo, telemetría y JARVIS.

Ejecutar (desde la raíz del repo):
    python -m streamlit run app/streamlit/app.py

Panel alternativo con widgets nativos de Streamlit: app/streamlit/app_nativo.py
"""
from __future__ import annotations

import base64
import re
from pathlib import Path

import streamlit as st

APP_DIR = Path(__file__).resolve().parents[1]          # .../app
V2_DIR = APP_DIR / "web" / "v2"
SHARED_DIR = APP_DIR / "shared"

st.set_page_config(page_title="Robot ESP32-S3", page_icon="🤖", layout="wide")


def _sources() -> list[Path]:
    return [V2_DIR / "index.html", V2_DIR / "style.css", V2_DIR / "app.js",
            *sorted(SHARED_DIR.glob("*.js")), *sorted((V2_DIR / "fonts").glob("*.woff2"))]


def _inline_script(code: str) -> str:
    # Evita que un "</script" dentro del JS cierre la etiqueta antes de tiempo.
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


@st.cache_data(show_spinner=False)
def build_page(_mtimes: tuple[float, ...]) -> str:
    """Une index.html + style.css + fuentes + scripts en un único documento."""
    html = (V2_DIR / "index.html").read_text(encoding="utf-8")
    css = (V2_DIR / "style.css").read_text(encoding="utf-8")

    def font_to_data_uri(match: re.Match[str]) -> str:
        data = (V2_DIR / match.group(1)).read_bytes()
        return 'url("data:font/woff2;base64,' + base64.b64encode(data).decode("ascii") + '")'

    css = re.sub(r'url\("(fonts/[^"]+\.woff2)"\)', font_to_data_uri, css)
    html = re.sub(r'<link rel="stylesheet" href="style\.css"\s*/?>',
                  lambda _m: "<style>\n" + css + "\n</style>", html)

    def script_to_inline(match: re.Match[str]) -> str:
        src = match.group(1)
        path = (V2_DIR / src).resolve()
        return _inline_script(path.read_text(encoding="utf-8"))

    html = re.sub(r'<script src="([^"]+)"></script>', script_to_inline, html)
    return html


page = build_page(tuple(p.stat().st_mtime for p in _sources()))

# La interfaz v2 ocupa todo el ancho de la ventana, como en la versión web.
# config.toml no tiene márgenes laterales, así que se quitan con CSS mínimo.
st.html("""<style>
  [data-testid="stMainBlockContainer"] { padding-left: 0; padding-right: 0; max-width: 100%; }
</style>""")

st.iframe(page, height="content")
