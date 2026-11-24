#include "Telemetry.h"
#include "Compass.h"
#include "ColorSensor.h"
#include "ObstacleSensor.h"
#include "ControlManual.h"
#include "FSMGlobal.h"

namespace Telemetry {

static float angleError(float target, float actual) {
  float diff = target - actual;
  while (diff > 180.0f) diff -= 360.0f;
  while (diff < -180.0f) diff += 360.0f;
  return diff;
}

TelemetryData snapshot(const Compass &compass,
                       const ColorSensor &color,
                       const ObstacleSensor &obstacle,
                       const ObstacleSensor &obstacleLeft,
                       const ObstacleSensor &obstacleRight,
                       const ControlManual &manual,
                       const FSMGlobal &fsm) {
  TelemetryData d{};
  d.mode = fsm.modeName();
  d.conn = true;

  d.headingValid = compass.isValid();
  d.headingActual = compass.headingDeg();
  d.headingTargetValid = fsm.hasHeadingTarget();
  d.headingTarget = fsm.headingTarget();
  d.headingError = (d.headingValid && d.headingTargetValid)
                       ? angleError(d.headingTarget, d.headingActual)
                       : 0.0f;

  d.colorValid = color.isValid();
  d.colorName = colorName(color.color());
  d.colorR = (uint8_t)(color.red() >> 8);
  d.colorG = (uint8_t)(color.green() >> 8);
  d.colorB = (uint8_t)(color.blue() >> 8);

  d.obstacleValid = obstacle.isValid();
  d.obstacleDistanceCm = obstacle.distanceCm();
  d.obstacleBlocked = obstacle.isBlocked();

  d.obstacleLeftValid = obstacleLeft.isValid();
  d.obstacleLeftDistanceCm = obstacleLeft.distanceCm();
  d.obstacleLeftBlocked = obstacleLeft.isBlocked();

  d.obstacleRightValid = obstacleRight.isValid();
  d.obstacleRightDistanceCm = obstacleRight.distanceCm();
  d.obstacleRightBlocked = obstacleRight.isBlocked();

  d.motorLeft = manual.leftCmd();
  d.motorRight = manual.rightCmd();
  d.motorState = manual.isMoving() ? "moving" : "stopped";
  d.navState = fsm.isEstop() ? "SAFE" : (fsm.isManual() ? "MANUAL" : (fsm.isAuto() ? "AUTONOMO" : "IDLE"));
  d.navLevel = 1;
  d.estop = fsm.isEstop();
  return d;
}

} // namespace Telemetry
