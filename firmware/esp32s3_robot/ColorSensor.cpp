#include "ColorSensor.h"
#include "Config.h"
#include <Wire.h>
#include <math.h>

// ---------------------------------------------------------------------------
// Clasificacion por umbrales (algoritmo documentado y verificable).
//
//   1) clear bajo                         -> NEGRO
//   2) claro alto y saturacion baja       -> BLANCO
//   3) en otro caso, se calcula el matiz (hue) en [0,360) y la saturacion:
//        rojo    hue < 20  o  hue >= 340
//        amarillo 40 <= hue < 70
//        verde    90 <= hue < 150
//        azul     190 <= hue < 260
//        resto   -> DESCONOCIDO
//
// Los limites son PROPUESTOS; se fijan con muestras reales (V-05).
// ---------------------------------------------------------------------------
ColorName classifyColor(uint16_t r, uint16_t g, uint16_t b, uint16_t clear) {
  if (clear < TCS_BLACK_CLEAR_MAX) return ColorName::NEGRO;

  float rf = (float)r, gf = (float)g, bf = (float)b;
  float mx = fmaxf(rf, fmaxf(gf, bf));
  float mn = fminf(rf, fminf(gf, bf));

  if (mx <= 0.0f) return ColorName::NEGRO;

  float v = mx;                       // valor (brillo)
  float sat = (mx - mn) / mx;         // saturacion 0..1

  // Blanco: mucho brillo y poca saturacion.
  if (sat < TCS_WHITE_SAT_MAX && v > (float)TCS_BLACK_CLEAR_MAX) {
    return ColorName::BLANCO;
  }

  // Matiz (hue)
  float hue;
  float delta = mx - mn;
  if (delta <= 0.0f) return ColorName::BLANCO;
  if (mx == rf)       hue = 60.0f * fmodf((gf - bf) / delta, 6.0f);
  else if (mx == gf)  hue = 60.0f * (((bf - rf) / delta) + 2.0f);
  else                hue = 60.0f * (((rf - gf) / delta) + 4.0f);
  if (hue < 0.0f) hue += 360.0f;

  if (hue < 20.0f || hue >= 340.0f) return ColorName::ROJO;
  if (hue >= 40.0f && hue < 70.0f)  return ColorName::AMARILLO;
  if (hue >= 90.0f && hue < 150.0f) return ColorName::VERDE;
  if (hue >= 190.0f && hue < 260.0f) return ColorName::AZUL;
  return ColorName::DESCONOCIDO;
}

const char *colorName(ColorName c) {
  switch (c) {
    case ColorName::NEGRO:    return "negro";
    case ColorName::BLANCO:   return "blanco";
    case ColorName::ROJO:     return "rojo";
    case ColorName::AMARILLO: return "amarillo";
    case ColorName::VERDE:    return "verde";
    case ColorName::AZUL:     return "azul";
    default:                  return "desconocido";
  }
}

bool ColorSensor::writeReg(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(ADDR_TCS34725);
  Wire.write(TCS_CMD_BIT | reg);
  Wire.write(value);
  return (Wire.endTransmission() == 0);
}

bool ColorSensor::readBlock(uint8_t reg, uint8_t *buf, uint8_t len) {
  Wire.beginTransmission(ADDR_TCS34725);
  Wire.write(TCS_CMD_BIT | TCS_CMD_AUTOINC | reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)ADDR_TCS34725, (int)len) != len) return false;
  for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

bool ColorSensor::begin() {
  _present = false;
  _valid = false;

  uint8_t id = 0;
  if (!readBlock(TCS_REG_ID, &id, 1)) return false;
  if (id != TCS_ID_34725 && id != TCS_ID_34727) {
    // ID inesperado: se sigue intentando, pero se registra como no presente.
  }
  _present = true;

  // Tiempo de integracion y de espera
  writeReg(TCS_REG_ATIME, TCS_ATIME);
  writeReg(TCS_REG_WTIME, TCS_WTIME);
  // Ganancia
  writeReg(TCS_REG_CONTROL, TCS_GAIN_4X);
  // Encender (PON) y esperar el primer ciclo de integracion
  writeReg(TCS_REG_ENABLE, TCS_ENABLE_PON);
  delay(3);   // arranque unico
  // Activar conversion AD (AEN)
  writeReg(TCS_REG_ENABLE, TCS_ENABLE_PON | TCS_ENABLE_AEN);
  return true;
}

bool ColorSensor::read() {
  uint8_t buf[8];
  if (!readBlock(TCS_REG_CDATA, buf, 8)) {
    _valid = false;
    return false;
  }
  _clear = (uint16_t)((buf[1] << 8) | buf[0]);
  _r     = (uint16_t)((buf[3] << 8) | buf[2]);
  _g     = (uint16_t)((buf[5] << 8) | buf[4]);
  _b     = (uint16_t)((buf[7] << 8) | buf[6]);

  _color = classifyColor(_r, _g, _b, _clear);
  _valid = true;
  return true;
}

void ColorSensor::update(uint32_t nowMs) {
  if (nowMs - _lastRead < TCS_READ_PERIOD_MS) return;
  _lastRead = nowMs;
  read();
}
