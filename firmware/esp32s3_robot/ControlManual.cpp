#include "ControlManual.h"
#include "Config.h"

int ControlManual::clamp100(int v) {
  if (v > 100) return 100;
  if (v < -100) return -100;
  return v;
}

// Suma el offset en el sentido de giro de la rueda, sin cambiar ese sentido:
// +40 con -8 -> +32; -40 con -8 -> -32; 0 -> 0; +5 con -8 -> 0.
int ControlManual::withOffset(int speed, int offset) {
  if (speed == 0) return 0;
  int mag = abs(speed) + offset;
  if (mag < 0) mag = 0;
  return speed > 0 ? mag : -mag;
}

void ControlManual::begin(MotorDriver *driver) {
  _driver = driver;
  if (_driver) {
    _driver->begin();
    _driver->safeStop();
  }
  _armed = false;
  _left = 0;
  _right = 0;
  _lastCmdMs = millis();
  _moveTimeoutMs = MANUAL_MOVE_TIMEOUT_MS;
}

bool ControlManual::arm() {
  if (!_driver) return false;
  if (_armed) return false;

  _driver->enable();
  _armed = true;
  _left = 0;
  _right = 0;
  _lastCmdMs = millis();
  _moveTimeoutMs = MANUAL_MOVE_TIMEOUT_MS;
  return true;
}

void ControlManual::disarm() {
  if (_driver) _driver->safeStop();
  _armed = false;
  _left = 0;
  _right = 0;
}

void ControlManual::stopMotion() {
  if (_driver) _driver->stop();
  _left = 0;
  _right = 0;
  _lastCmdMs = millis();
}

bool ControlManual::setWheels(int left, int right) {
  return setWheels(left, right, MANUAL_MOVE_TIMEOUT_MS);
}

bool ControlManual::setWheels(int left, int right, uint32_t moveTimeoutMs) {
  if (!_driver || !_armed || !_driver->isEnabled()) return false;

  // Aplicar offsets de desbalance de motores.
  // offset positivo = esa rueda más rápida, en el sentido en que gire.
  // Una rueda en 0 se queda en 0 (antes el offset la movía hacia atrás).
  left = clamp100(withOffset(left, MOTOR_LEFT_SPEED_OFFSET));
  right = clamp100(withOffset(right, MOTOR_RIGHT_SPEED_OFFSET));

  _left = left;
  _right = right;
  _driver->setLeft(_left);
  _driver->setRight(_right);
  _lastCmdMs = millis();
  _moveTimeoutMs = moveTimeoutMs;
  return true;
}

bool ControlManual::forward(int speed) {
  return forward(speed, MANUAL_MOVE_TIMEOUT_MS);
}

bool ControlManual::forward(int speed, uint32_t moveTimeoutMs) {
  return setWheels(speed, speed, moveTimeoutMs);
}

bool ControlManual::back(int speed) {
  return back(speed, MANUAL_MOVE_TIMEOUT_MS);
}

bool ControlManual::back(int speed, uint32_t moveTimeoutMs) {
  return setWheels(-speed, -speed, moveTimeoutMs);
}

bool ControlManual::turnLeft(int speed) {
  return turnLeft(speed, MANUAL_MOVE_TIMEOUT_MS);
}

bool ControlManual::turnLeft(int speed, uint32_t moveTimeoutMs) {
  return setWheels(-speed, speed, moveTimeoutMs);
}

bool ControlManual::turnRight(int speed) {
  return turnRight(speed, MANUAL_MOVE_TIMEOUT_MS);
}

bool ControlManual::turnRight(int speed, uint32_t moveTimeoutMs) {
  return setWheels(speed, -speed, moveTimeoutMs);
}

ControlManual::Event ControlManual::update(uint32_t now) {
  if (!_armed) return EVENT_NONE;

  bool moving = isMoving();
  uint32_t timeout = moving ? _moveTimeoutMs : MANUAL_ARM_TIMEOUT_MS;
  int32_t elapsed = (int32_t)(now - _lastCmdMs);
  if (elapsed > (int32_t)timeout) {
    disarm();
    return moving ? EVENT_MOVE_TIMEOUT : EVENT_ARM_TIMEOUT;
  }
  return EVENT_NONE;
}
