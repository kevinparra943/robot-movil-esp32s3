#include "Compass.h"
#include "Config.h"
#include "Geometry.h"
#include <Wire.h>
#include <math.h>

bool Compass::writeReg(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(ADDR_QMC5883L);
  Wire.write(reg);
  Wire.write(value);
  return (Wire.endTransmission() == 0);
}

bool Compass::readBlock(uint8_t reg, uint8_t *buf, uint8_t len) {
  Wire.beginTransmission(ADDR_QMC5883L);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;   // repeated start
  if (Wire.requestFrom((int)ADDR_QMC5883L, (int)len) != len) return false;
  for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

bool Compass::begin() {
  _valid = false;
  _heading = NAN;

  // ¿Responde el chip y tiene el ID esperado?
  uint8_t id = 0;
  if (!readBlock(QMC_REG_CHIP_ID, &id, 1)) return false;
  if (id != QMC_CHIP_ID_VALUE) {
    // Algunos clones no devuelven 0xFF; seguimos e intentamos configurar.
  }

  // Soft reset
  writeReg(QMC_REG_CTRL2, 0x80);
  delay(10);   // unico retardo de arranque, admisible (una vez)

  // Periodo SET/RESET recomendado por el fabricante
  writeReg(QMC_REG_SETRESET, 0x01);
  // Modo continuo a 200 Hz, +-8 G
  if (!writeReg(QMC_REG_CTRL1, QMC_CTRL1_200HZ_8G)) return false;
  return true;
}

bool Compass::read() {
  uint8_t status = 0;
  if (!readBlock(QMC_REG_STATUS, &status, 1)) {
    _valid = false;
    return false;
  }
  _overflow = (status & QMC_STATUS_OVERFLOW) != 0;

  uint8_t buf[6];
  if (!readBlock(QMC_REG_DATA, buf, 6)) {
    _valid = false;
    return false;
  }

  _rawX = (int16_t)((buf[1] << 8) | buf[0]);
  _rawY = (int16_t)((buf[3] << 8) | buf[2]);
  _rawZ = (int16_t)((buf[5] << 8) | buf[4]);

  // Magnitud en el plano XY: si es muy baja, el rumbo no es fiable.
  float mx = ((float)_rawX - _offX) * _scaleX;
  float my = ((float)_rawY - _offY) * _scaleY;
  float mag = sqrtf(mx * mx + my * my);

  if (_overflow || mag < QMC_MIN_MAGNITUDE) {
    _valid = false;
    _heading = NAN;
    return false;
  }

  // Rumbo magnetico; se corrige con declinacion y desfase de montaje.
  float heading = atan2f(my, mx) * 180.0f / (float)M_PI;
  _heading = Geometry::wrap360(heading + _declination + _mountOffset);
  _valid = true;
  return true;
}

void Compass::update(uint32_t nowMs) {
  if (nowMs - _lastRead < QMC_READ_PERIOD_MS) return;
  _lastRead = nowMs;
  read();
}

float Compass::headingDeg() const { return _heading; }

void Compass::setHardIron(float offX, float offY, float offZ) {
  _offX = offX;
  _offY = offY;
  _offZ = offZ;
  _calibrated = true;
}

void Compass::setSoftIron(float scaleX, float scaleY) {
  _scaleX = scaleX;
  _scaleY = scaleY;
}
