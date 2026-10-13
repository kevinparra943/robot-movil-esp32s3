# Robot mÃ³vil inteligente con ESP32-S3

Proyecto de ingenierÃ­a mecatrÃ³nica (Universidad Militar Nueva Granada). Robot
mÃ³vil diferencial de 2 ruedas con ESP32-S3 que integra control manual, control
por voz, navegaciÃ³n autÃ³noma, brÃºjula digital, detecciÃ³n de colores, detecciÃ³n y
evasiÃ³n de obstÃ¡culos, telemetrÃ­a inalÃ¡mbrica y un asistente tipo JARVIS.

> **Estado:** Fases 1â€“2 completas, Fase 4 (sensores) y Fase 6 (protocolo, app
> web y JARVIS) implementadas en software. No hay hardware montado todavÃ­a. Todo
> lo que no estÃ¡ confirmado se marca como `[POR DEFINIR]`. **No se ha inventado
> ningÃºn dato de hardware.**

---

## Estado del proyecto

| Elemento | Estado |
|----------|--------|
| AuditorÃ­a del proyecto | âœ… Completada |
| Repositorio y estructura | âœ… Creada |
| BOM (lista de materiales) | âœ… `hardware/BOM.xlsx` |
| Requisitos y trazabilidad | âœ… `docs/requisitos.md` |
| Arquitectura y pinout | âœ… `docs/arquitectura.md`, `hardware/pinout.md` |
| Protocolo de comunicaciÃ³n | âœ… `docs/protocolo_comunicacion.md` |
| MÃ¡quina de estados | âœ… `docs/maquina_estados.md` |
| AnÃ¡lisis de riesgos | âœ… `docs/riesgos.md` |
| Firmware mÃ­nimo (T-00) | âœ… `firmware/esp32s3_robot/` (compila) |
| MÃ³dulos de sensores (Fase 4) | âœ… BrÃºjula, color, obstÃ¡culo y encoders |
| Protocolo, app web y JARVIS | âœ… `app/` (con modo simulaciÃ³n) |
| Pruebas de host (sin placa) | âœ… ejecutadas (7 archivos, 0 fallos) |
| Informe IEEE (base) | âœ… `report/informe.tex` (compila) |
| Montaje y calibraciÃ³n | âŒ Pendiente de hardware |

---

## Hardware (resumen)

| FunciÃ³n | Componente elegido | Estado |
|---------|--------------------|--------|
| MCU | ESP32-S3 DevKit **N16R8** | ðŸ”µ Disponible |
| Motores | TT reductor con encoder, 6 V, 110 rpm, 1:90 | ðŸ›’ A comprar |
| Driver motores | **TB6612FNG** | ðŸ›’ A comprar |
| BrÃºjula | **GY-271 (QMC5883L)**, IÂ²C | ðŸ›’ A comprar |
| Color | **TCS34725**, IÂ²C | ðŸ›’ A comprar |
| ObstÃ¡culos | **HC-SR04** (ultrasÃ³nico) | ðŸ›’ A comprar |
| BaterÃ­a | Li-ion **3S** + BMS + buck a 6 V/5 V | ðŸ›’ A comprar |
| Chasis | Fabricado (acrÃ­lico) | ðŸ› ï¸ Fabricar |

Detalle y precios en [`hardware/BOM.xlsx`](hardware/BOM.xlsx) y
[`hardware/bom.md`](hardware/bom.md). Conexiones en
[`hardware/pinout.md`](hardware/pinout.md).

**DecisiÃ³n de entorno:** **Arduino framework (C++)**. JustificaciÃ³n en
[`docs/arquitectura.md`](docs/arquitectura.md).

---

## Estructura del repositorio

```
PROYECTO_LAB/
â”œâ”€â”€ README.md
â”œâ”€â”€ firmware/            firmware de la ESP32-S3 (Arduino C++)
â”œâ”€â”€ app/                 aplicaciÃ³n web de control y monitorizaciÃ³n
â”œâ”€â”€ hardware/            BOM, pinout, esquemas elÃ©ctricos
â”œâ”€â”€ cad/                 diseÃ±o mecÃ¡nico / piezas del chasis
â”œâ”€â”€ docs/                especificaciÃ³n, protocolo, FSM, riesgos
â”œâ”€â”€ report/              informe tÃ©cnico en LaTeX (IEEEtran UMNG)
â””â”€â”€ tests/               pruebas que corren en el PC (sin placa)
```

---

## Puesta en marcha del firmware

1. Instala el **core ESP32** en Arduino IDE (Gestor de tarjetas, versiÃ³n 3.3.x).
2. Abre `firmware/esp32s3_robot/esp32s3_robot.ino`.
3. Placa: **ESP32S3 Dev Module**. PSRAM: **OPI PSRAM**.
4. Compila y carga. Monitor serie a **115200**.

CompilaciÃ³n por lÃ­nea de comandos (verificada en este entorno):

```powershell
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli compile --fqbn esp32:esp32:esp32s3:PSRAM=opi firmware\esp32s3_robot
```

### QuÃ© hace el firmware actual (v0.2.0)

- Imprime un banner de arranque con la versiÃ³n.
- Fuerza los motores a **estado seguro (parado)** â€” STBY en bajo.
- Ejecuta un **escÃ¡ner IÂ²C** e informa quÃ© direcciones se detectan.
- EnvÃ­a un **latido (heartbeat)** por serie cada segundo.
- Responde `PING` con `PONG` (comprobaciÃ³n de enlace).
- Lee **brÃºjula** (rumbo), **color** (clasificaciÃ³n), **distancia** (HC-SR04 no
  bloqueante) y **encoders**, todo de forma no bloqueante.

âš ï¸ **No conectes motores ni el driver durante esta fase.** El firmware valida
placa, toolchain, bus IÂ²C y sensores; los motores permanecen detenidos.

### Pruebas de host (sin placa)

```powershell
python tests\host\run_all.py
```

Ejecutan las pruebas Python y, si hay `node`, las pruebas JS (protocolo, voz,
JARVIS e integraciÃ³n WebSocket). Ver [`docs/trazabilidad.md`](docs/trazabilidad.md).

---

## App web de control

Panel HTML/JS que habla con el robot por WebSocket (protocolo JSON v1). Incluye
control manual, modos, voz, telemetrÃ­a y JARVIS.

```powershell
python app\serve.py            # http://localhost:8000/web/index.html
```

Sin robot, activa **Modo simulaciÃ³n** en la interfaz. Detalles en
[`app/README.md`](app/README.md).

---

## Seguridad (reglas mÃ­nimas)

- **Nunca** conectes un motor directamente a un GPIO.
- Motores alimentados **desde la baterÃ­a**, nunca desde el regulador del S3.
- **GND comÃºn** entre baterÃ­a, driver y MCU.
- Estado seguro (motores detenidos) al arrancar, reiniciar y ante fallo de enlace.
- No cargar la baterÃ­a Li-ion sin supervisiÃ³n.

---

## Repositorio y licencia

Proyecto acadÃ©mico. No subir credenciales, claves ni binarios innecesarios
(ver [`.gitignore`](.gitignore)).
