#include "ColorSensor.h"
#include "Config.h"
#include <Wire.h>
#include <math.h>

// ---------------------------------------------------------------------------
// Clasificacion por tono (algoritmo documentado y verificable).
//
// El tono (hue) identifica el color aunque cambie el brillo: un reflejo de la
// cinta multiplica R, G y B por igual, sube el clear pero no mueve el tono.
// El LED del modulo es calido, por eso blanco, negro y amarillo caen todos en
// la zona naranja (15-70°) y se separan por saturacion y brillo:
//
//   clear muy bajo                         -> NEGRO
//   gris exacto (R=G=B)                    -> NEGRO / BLANCO por clear
//   tono < 15° o >= 330°, saturado         -> ROJO
//   tono 15-70° (zona calida):
//       saturacion >= TCS_YELLOW_SAT_MIN   -> AMARILLO
//       clear < TCS_BW_CLEAR_SPLIT         -> NEGRO
//       si no                              -> BLANCO
//   tono 70-160°                           -> VERDE
//   tono 160-260°                          -> AZUL
//   resto (260-330°, magenta/violeta)      -> DESCONOCIDO
//
// Umbrales en Config.h (calibracion 2026-11-23). Espejo en tests/host/test_color.py.
// ---------------------------------------------------------------------------
ColorName classifyColor(uint16_t r, uint16_t g, uint16_t b, uint16_t clear) {
  if (clear < TCS_DARK_CLEAR) return ColorName::NEGRO;

  float rf = (float)r, gf = (float)g, bf = (float)b;
  float mx = fmaxf(rf, fmaxf(gf, bf));
  float mn = fminf(rf, fminf(gf, bf));
  float delta = mx - mn;

  if (mx <= 0.0f) return ColorName::NEGRO;
  if (delta <= 0.0f) {
    return (clear < TCS_BW_CLEAR_SPLIT) ? ColorName::NEGRO : ColorName::BLANCO;
  }

  float sat = delta / mx;             // saturacion 0..1
  float hue;
  if (mx == rf)       hue = 60.0f * fmodf((gf - bf) / delta, 6.0f);
  else if (mx == gf)  hue = 60.0f * (((bf - rf) / delta) + 2.0f);
  else                hue = 60.0f * (((rf - gf) / delta) + 4.0f);
  if (hue < 0.0f) hue += 360.0f;

  bool redHue = (hue < TCS_RED_HUE_MAX || hue >= TCS_RED_HUE_WRAP);
  if (redHue && sat >= TCS_RED_SAT_MIN) return ColorName::ROJO;

  if (redHue || hue < TCS_WARM_HUE_MAX) {
    if (sat >= TCS_YELLOW_SAT_MIN) return ColorName::AMARILLO;
    return (clear < TCS_BW_CLEAR_SPLIT) ? ColorName::NEGRO : ColorName::BLANCO;
  }
  if (hue < TCS_GREEN_HUE_MAX) return ColorName::VERDE;
  if (hue < TCS_BLUE_HUE_MAX)  return ColorName::AZUL;
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
  writeReg(TCS_REG_CONTROL, TCS_GAIN_16X);
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

  // Todo en 0: si el chip se reinició (microcorte de alimentación, cable
  // movido) sus registros vuelven a "apagado" y responde ceros por I2C sin
  // integrar. Se comprueba ENABLE y, si no está PON|AEN, se reconfigura.
  if (_r == 0 && _g == 0 && _b == 0 && _clear == 0) {
    uint8_t en = 0;
    const uint8_t on = TCS_ENABLE_PON | TCS_ENABLE_AEN;
    if (!readBlock(TCS_REG_ENABLE, &en, 1) || (en & on) != on) {
      Serial.println(F("[COLOR] TCS34725 apagado (reinicio del chip): se reconfigura."));
      begin();
      _valid = false;
      return false;
    }
  }

  _color = classifyColor(_r, _g, _b, _clear);
  _valid = true;
  return true;
}

void ColorSensor::update(uint32_t nowMs) {
  if (nowMs - _lastRead < TCS_READ_PERIOD_MS) return;
  _lastRead = nowMs;
  read();
}
