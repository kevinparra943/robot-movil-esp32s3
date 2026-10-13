#ifndef COMPASS_H
#define COMPASS_H

#include <Arduino.h>

// ===========================================================================
// Compass - brujula digital QMC5883L (I2C 0x0D), RF-04.
// Lee el magnetometro, aplica calibracion (hard/soft iron) y entrega rumbo en
// grados [0,360). Marca las lecturas no fiables (overflow o magnitud baja).
// ===========================================================================
class Compass {
public:
  // Comprueba el chip, hace soft-reset y lo configura en modo continuo.
  bool begin();

  // Lee una muestra del sensor. Devuelve true si la lectura es valida.
  bool read();

  // Rumbo actual en grados [0,360), o NAN si no hay lectura valida.
  float headingDeg() const;

  // Ultima lectura valida disponible.
  bool isValid() const { return _valid; }

  // Indica si se han cargado offsets de calibracion.
  bool isCalibrated() const { return _calibrated; }

  // --- Calibracion ---------------------------------------------------------
  // Hard-iron: offsets por eje (unidades crudas del sensor).
  void setHardIron(float offX, float offY, float offZ);
  // Soft-iron: factores de escala por eje X/Y (idealmente ~1.0).
  void setSoftIron(float scaleX, float scaleY);
  // Declinacion magnetica de la zona (grados).
  void setDeclination(float deg) { _declination = deg; }
  // Desfase de montaje del sensor respecto al frente del robot (grados).
  void setMountOffset(float deg) { _mountOffset = deg; }

  // --- Acceso a crudos (para calibracion / diagnostico) --------------------
  int16_t rawX() const { return _rawX; }
  int16_t rawY() const { return _rawY; }
  int16_t rawZ() const { return _rawZ; }
  bool overflow() const { return _overflow; }

  // Actualiza la lectura respetando QMC_READ_PERIOD_MS (no bloqueante).
  void update(uint32_t nowMs);

private:
  int16_t _rawX = 0, _rawY = 0, _rawZ = 0;
  float _offX = 0, _offY = 0, _offZ = 0;
  float _scaleX = 1.0f, _scaleY = 1.0f;
  float _declination = 0.0f;
  float _mountOffset = 0.0f;
  float _heading = NAN;
  bool _valid = false;
  bool _overflow = false;
  bool _calibrated = false;
  uint32_t _lastRead = 0;

  bool writeReg(uint8_t reg, uint8_t value);
  bool readBlock(uint8_t reg, uint8_t *buf, uint8_t len);
};

#endif // COMPASS_H
