#include "FSMGlobal.h"

void FSMGlobal::begin(ControlManual *manual) {
  _manual = manual;
  _state = IDLE;
  _headingTargetValid = false;
  _headingTarget = 0.0f;
  _lastEvent = ControlManual::EVENT_NONE;
}

bool FSMGlobal::setManual() {
  if (!_manual || _state == SAFE) return false;
  if (!_manual->isArmed()) {
    _manual->arm();
  }
  _state = MANUAL;
  return _manual->isArmed();
}

bool FSMGlobal::setAutonomo() {
  if (!_manual || _state == SAFE) return false;
  _manual->disarm();
  _state = AUTONOMO;
  return true;
}

void FSMGlobal::setIdle() {
  if (_manual) _manual->disarm();
  if (_state != SAFE) _state = IDLE;
}

void FSMGlobal::estop() {
  if (_manual) _manual->disarm();
  _state = SAFE;
}

void FSMGlobal::stopMotion() {
  if (_manual) _manual->stopMotion();
}

void FSMGlobal::setHeadingTarget(float deg) {
  if (deg < 0.0f) deg = 0.0f;
  if (deg >= 360.0f) deg = 359.9f;
  _headingTarget = deg;
  _headingTargetValid = true;
}

void FSMGlobal::clearHeadingTarget() {
  _headingTargetValid = false;
}

ControlManual::Event FSMGlobal::update(uint32_t now) {
  if (!_manual || _state == SAFE) return ControlManual::EVENT_NONE;
  _lastEvent = _manual->update(now);
  return _lastEvent;
}

const char *FSMGlobal::modeName() const {
  switch (_state) {
    case MANUAL:   return "manual";
    case AUTONOMO: return "autonomo";
    case SAFE:     return "safe";
    case ERROR:    return "error";
    default:       return "idle";
  }
}

const char *FSMGlobal::stateLabel() const {
  switch (_state) {
    case MANUAL:   return "MANUAL";
    case AUTONOMO: return "AUTONOMO";
    case SAFE:     return "SAFE";
    case ERROR:    return "ERROR";
    default:       return "DETENIDO";
  }
}

bool FSMGlobal::isArmed() const {
  return _manual && _manual->isArmed();
}
