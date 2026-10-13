# Lista de materiales (BOM)

> **Fuente de verdad:** `hardware/BOM.xlsx` 
> `hardware/BOM.xlsx`). **Precios orientativos en COP**, a
> confirmar antes de comprar.

## Resumen por categoría

| Categoría | Incluye |
|-----------|---------|
| Control | ESP32-S3 DevKit N16R8 (disponible) |
| Motores y tracción | 2× motor TT con encoder, ruedas (disponibles), rueda loca |
| Driver | TB6612FNG |
| Sensores | GY-271 (QMC5883L), TCS34725, HC-SR04 |
| Alimentación | 3× celda 18650 (3S), BMS 3S, portapilas, cargador, 2× buck |
| Estructura | Chasis acrílico (fabricar), tornillería |
| Cableado | Dupont, cable motor, borneras |
| Protección | Interruptor, fusible, pasivos |
| Herramientas | Multímetro (disponible) |

## Totales estimados

| Concepto | Valor (COP) |
|----------|------------:|
| **Total (todos los ítems, incluye TENGO)** | **$304.562** |
| **Total solo a comprar (COMPRAR)** | **$219.562** |

Incluye un banco **3S** (fila de celdas ×3 + BMS + cargador) y **chasis
fabricado en acrílico**. El detalle, con cantidades, precios y estado
(TENGO/COMPRAR/FABRICAR), está en el Excel.

## Notas importantes del BOM

- **Batería 3S**: 11,1 V nominal / 12,6 V llena. **Obliga** a buck a 6 V
  (motores) y 5 V (lógica). Seguridad: BMS + fusible + carga supervisada.
- **Sensor de color TCS34725**: distinguir **6 colores** puede exigir
  calibración estricta; si no separa, se documenta como limitación.
- **Brújula GY-271**: el HMC5883L está descatalogado; usar **QMC5883L**.
  Requiere calibración y alejarla de motores.
- **HC-SR04**: ECHO entrega 5 V → **divisor resistivo** a 3,3 V.
