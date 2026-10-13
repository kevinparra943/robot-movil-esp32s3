#ifndef COLOR_SENSOR_H
#define COLOR_SENSOR_H

#include <Arduino.h>

// ===========================================================================
// ColorSensor - sensor RGB TCS34725 (I2C 0x29), RF-05.
// Lee clear/R/G/B y clasifica en NEGRO, BLANCO, ROJO, AMARILLO, VERDE o AZUL
// mediante umbrales. La calibracion de umbrales queda pendiente (V-05).
// ===========================================================================
enum class ColorName : uint8_t {
  DESCONOCIDO = 0,
  NEGRO,
  BLANCO,
  ROJO,
  AMARILLO,
  VERDE,
  AZUL
};

// Clasificacion pura (sin hardware) - verificable por separado.
// Devuelve el color a partir de las componentes y del valor "clear".
ColorName classifyColor(uint16_t r, uint16_t g, uint16_t b, uint16_t clear);

const char *colorName(ColorName c);

class ColorSensor {
public:
  // Comprueba el ID del chip y lo configura (ganancia + tiempo de integracion).
  bool begin();

  // Lee r,g,b,clear del sensor. Devuelve true si el dispositivo respondio.
  bool read();

  // Actualiza respetando TCS_READ_PERIOD_MS (no bloqueante).
  void update(uint32_t nowMs);

  bool isPresent() const { return _present; }
  bool isValid() const { return _valid; }

  uint16_t red() const { return _r; }
  uint16_t green() const { return _g; }
  uint16_t blue() const { return _b; }
  uint16_t clear() const { return _clear; }
  ColorName color() const { return _color; }

private:
  bool _present = false;
  bool _valid = false;
  uint16_t _r = 0, _g = 0, _b = 0, _clear = 0;
  ColorName _color = ColorName::DESCONOCIDO;
  uint32_t _lastRead = 0;

  bool writeReg(uint8_t reg, uint8_t value);
  bool readBlock(uint8_t reg, uint8_t *buf, uint8_t len);
};

#endif // COLOR_SENSOR_H
