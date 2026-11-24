# Informes (LaTeX, formato IEEE UMNG)

| Archivo | Contenido |
|---------|-----------|
| `informe_final.tex` / `.pdf` | Informe final del proyecto |
| `entrega2/` | Informe de la segunda entrega (estado de ese momento) |

Las imágenes se toman de `../imagenes` y `../cad`. Compilar dos veces dentro de
la carpeta de cada informe:

```powershell
cd report
pdflatex -interaction=nonstopmode informe_final.tex
```
