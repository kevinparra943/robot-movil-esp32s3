#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <Arduino.h>
#include "Config.h"
#include "Telemetry.h"

class Protocol {
public:
  enum class Type : uint8_t {
    HELLO = 0,
    PING,
    MODE,
    DRIVE,
    HEADING,
    CALIB,
    ESTOP,
    STATUS,
    INVALID
  };

  struct Command {
    Type type = Type::INVALID;
    String mode;
    String strategy;          // mode=autonomo: "evadir" | "rumbo" | "linea"
    bool hasDeg = false;      // mode=autonomo + rumbo: trae rumbo deseado en deg
    String dir;
    int speed = 0;
    float deg = 0.0f;
    String what;
    String action;
    String until;
    float stopCm = OBSTACLE_APPROACH_STOP_CM;
    uint32_t maxMs = OBSTACLE_APPROACH_MAX_MS;
    String errorCode;
    String errorDetail;
  };

  static bool parse(const char *raw, Command &out);

  static String helloAck();
  static String pong();
  static String ack(const char *of);
  static String ack(const char *of, const char *value);
  static String ack(const char *of, int value);
  static String ack(const char *of, float value);
  static String error(const char *code, const char *detail = "");
  static String event(const char *code, const char *detail = "");
  static String telemetry(const TelemetryData &data);

  static float angleError(float target, float actual);
};

#endif
