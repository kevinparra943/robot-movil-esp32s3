#ifndef TELEMETRY_H
#define TELEMETRY_H

#include <Arduino.h>

class Compass;
class ColorSensor;
class ObstacleSensor;
class ControlManual;
class FSMGlobal;

struct TelemetryData {
  const char *mode;
  bool conn;
  bool headingValid;
  float headingActual;
  bool headingTargetValid;
  float headingTarget;
  float headingError;
  bool colorValid;
  const char *colorName;
  uint8_t colorR;
  uint8_t colorG;
  uint8_t colorB;
  bool obstacleValid;
  float obstacleDistanceCm;
  bool obstacleBlocked;
  bool obstacleLeftValid;
  float obstacleLeftDistanceCm;
  bool obstacleLeftBlocked;
  bool obstacleRightValid;
  float obstacleRightDistanceCm;
  bool obstacleRightBlocked;
  int motorLeft;
  int motorRight;
  const char *motorState;
  const char *navState;
  int navLevel;
  const char *navStrategy;   // submodo autonomo; nullptr fuera de AUTONOMO
  bool estop;
};

namespace Telemetry {
TelemetryData snapshot(const Compass &compass,
                       const ColorSensor &color,
                       const ObstacleSensor &obstacle,
                       const ObstacleSensor &obstacleLeft,
                       const ObstacleSensor &obstacleRight,
                       const ControlManual &manual,
                       const FSMGlobal &fsm);
}

#endif
