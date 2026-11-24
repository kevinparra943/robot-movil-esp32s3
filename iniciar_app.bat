@echo off
REM Inicia la app Streamlit del robot. Doble clic sobre este archivo.
REM Funciona desde cualquier sitio: se ubica en la carpeta del proyecto.
cd /d "%~dp0"
echo Instalando/verificando dependencias...
python -m pip install --quiet -r app\streamlit\requirements.txt
echo.
echo Abriendo la app en el navegador (http://localhost:8501)...
echo Para cerrarla, cierra esta ventana o pulsa Ctrl+C.
python -m streamlit run app\streamlit\app.py
pause
