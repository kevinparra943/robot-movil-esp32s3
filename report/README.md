# Informe IEEE (LaTeX)

`informe.tex` es el **esqueleto** del informe basado en la plantilla IEEEtran de
la UMNG (Programa de Ingeniería Mecatrónica). Las secciones marcadas `[TODO]`
**no tienen contenido real**: no se ha inventado ningún dato, autor ni resultado.

## Compilar

Requiere una distribución LaTeX con `pdflatex` (p. ej. MiKTeX, ya instalado en
este equipo).

```powershell
pdflatex -interaction=nonstopmode report\informe.tex
```

Notas:

- Las imágenes van en `report/figs/`. El logo del encabezado (`LogoUMNG`) es
  **opcional**: si el archivo no existe, la portada compila sin él.
- Sustituye los `[TODO]` y `[NOMBRE DEL AUTOR]` por los datos reales antes de
  cualquier entrega.

## Secciones (según el enunciado)

Introducción, Objetivos, Requisitos, Marco teórico, Arquitectura, Diseño
mecánico, Diseño electrónico, Sensores, Firmware, Protocolo y app web, Sistema
autónomo, Chatbot, Metodología de pruebas, Resultados, Análisis de errores,
Conclusiones, Bibliografía y enlace al repositorio.
