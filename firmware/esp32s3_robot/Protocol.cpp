#include "Protocol.h"
#include <ArduinoJson.h>

static bool setError(Protocol::Command &out, const char *code, const String &detail) {
  out.type = Protocol::Type::INVALID;
  out.errorCode = code;
  out.errorDetail = detail;
  return false;
}

bool Protocol::parse(const char *raw, Command &out) {
  out = Command();

  static JsonDocument doc;
  doc.clear();

  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    return setError(out, "BAD_FORMAT", "JSON invalido");
  }

  if (!doc.is<JsonObject>()) {
    return setError(out, "BAD_FORMAT", "mensaje no es un objeto");
  }

  JsonObject obj = doc.as<JsonObject>();

  if (!obj["t"].is<const char *>()) {
    return setError(out, "BAD_FORMAT", "falta el campo 't'");
  }
  String type = obj["t"].as<const char *>();
  if (type.length() == 0) {
    return setError(out, "BAD_FORMAT", "campo 't' vacio");
  }

  if (!obj["v"].is<int>()) {
    return setError(out, "BAD_FORMAT", "falta el campo 'v'");
  }
  int version = obj["v"].as<int>();
  if (version != PROTOCOL_VERSION) {
    return setError(out, "VERSION_MISMATCH", "v=" + String(version));
  }

  if (type == "hello") {
    out.type = Type::HELLO;
    return true;
  }
  if (type == "ping") {
    out.type = Type::PING;
    return true;
  }
  if (type == "estop") {
    out.type = Type::ESTOP;
    return true;
  }
  if (type == "status") {
    out.type = Type::STATUS;
    return true;
  }

  if (type == "mode") {
    if (!obj["value"].is<const char *>()) {
      return setError(out, "BAD_FORMAT", "falta mode.value");
    }
    String value = obj["value"].as<const char *>();
    if (value != "manual" && value != "autonomo") {
      return setError(out, "BAD_FORMAT", "mode.value='" + value + "'");
    }
    // El robot no arranca en autonomo sin un submodo explicito.
    if (value == "autonomo") {
      if (!obj["strategy"].is<const char *>()) {
        return setError(out, "BAD_FORMAT", "falta mode.strategy");
      }
      String strategy = obj["strategy"].as<const char *>();
      if (strategy != "evadir" && strategy != "rumbo" && strategy != "linea") {
        return setError(out, "BAD_FORMAT", "mode.strategy='" + strategy + "'");
      }
      if (!obj["deg"].isNull()) {
        if (strategy != "rumbo") {
          return setError(out, "BAD_FORMAT", "mode.deg solo aplica a strategy=rumbo");
        }
        if (!obj["deg"].is<double>()) {
          return setError(out, "BAD_FORMAT", "mode.deg no es numerico");
        }
        float deg = obj["deg"].as<float>();
        if (deg < 0.0f || deg >= 360.0f) {
          return setError(out, "BAD_FORMAT", "mode.deg fuera de [0,360)");
        }
        out.deg = deg;
        out.hasDeg = true;
      }
      out.strategy = strategy;
    } else if (!obj["strategy"].isNull() || !obj["deg"].isNull()) {
      return setError(out, "BAD_FORMAT", "mode.strategy/deg requiere autonomo");
    }
    out.type = Type::MODE;
    out.mode = value;
    return true;
  }

  if (type == "drive") {
    if (!obj["dir"].is<const char *>()) {
      return setError(out, "BAD_FORMAT", "falta drive.dir");
    }
    String dir = obj["dir"].as<const char *>();
    if (dir != "fwd" && dir != "back" && dir != "left" && dir != "right" && dir != "stop") {
      return setError(out, "BAD_FORMAT", "drive.dir='" + dir + "'");
    }
    int speed = 60;
    if (!obj["speed"].isNull()) {
      if (!obj["speed"].is<int>()) {
        return setError(out, "BAD_FORMAT", "drive.speed no es entero");
      }
      speed = obj["speed"].as<int>();
      if (speed < 0 || speed > 100) {
        return setError(out, "BAD_FORMAT", "drive.speed fuera de 0..100");
      }
    }
    out.until = "";
    out.stopCm = OBSTACLE_APPROACH_STOP_CM;
    out.maxMs = OBSTACLE_APPROACH_MAX_MS;
    if (obj["until"].is<const char *>()) {
      String until = obj["until"].as<const char *>();
      if (until != "front_obstacle") {
        return setError(out, "BAD_FORMAT", "drive.until='" + until + "'");
      }
      if (dir != "fwd") {
        return setError(out, "BAD_FORMAT", "drive.until solo aplica a dir=fwd");
      }
      out.until = until;
      if (!obj["stop_cm"].isNull()) {
        if (!obj["stop_cm"].is<float>() && !obj["stop_cm"].is<int>()) {
          return setError(out, "BAD_FORMAT", "drive.stop_cm no es numerico");
        }
        float stopCm = obj["stop_cm"].as<float>();
        if (stopCm < OBSTACLE_APPROACH_STOP_MIN_CM || stopCm > OBSTACLE_APPROACH_STOP_MAX_CM) {
          return setError(out, "BAD_FORMAT", "drive.stop_cm fuera de 5-30");
        }
        out.stopCm = stopCm;
      }
      if (!obj["max_ms"].isNull()) {
        if (!obj["max_ms"].is<int>()) {
          return setError(out, "BAD_FORMAT", "drive.max_ms no es entero");
        }
        int maxMs = obj["max_ms"].as<int>();
        if (maxMs < 500 || maxMs > 15000) {
          return setError(out, "BAD_FORMAT", "drive.max_ms fuera de 500-15000");
        }
        out.maxMs = (uint32_t)maxMs;
      }
    } else if (!obj["stop_cm"].isNull() || !obj["max_ms"].isNull()) {
      return setError(out, "BAD_FORMAT", "drive.stop_cm/max_ms requiere until");
    }
    out.type = Type::DRIVE;
    out.dir = dir;
    out.speed = speed;
    return true;
  }

  if (type == "heading") {
    if (!obj["deg"].is<double>()) {
      return setError(out, "BAD_FORMAT", "falta heading.deg");
    }
    float deg = obj["deg"].as<float>();
    if (deg < 0.0f || deg >= 360.0f) {
      return setError(out, "BAD_FORMAT", "heading.deg fuera de [0,360)");
    }
    out.type = Type::HEADING;
    out.deg = deg;
    return true;
  }

  if (type == "calib") {
    if (!obj["what"].is<const char *>() || !obj["action"].is<const char *>()) {
      return setError(out, "BAD_FORMAT", "faltan calib.what/action");
    }
    String what = obj["what"].as<const char *>();
    String action = obj["action"].as<const char *>();
    if ((what != "compass" && what != "color") ||
        (action != "start" && action != "save")) {
      return setError(out, "BAD_FORMAT", "calib.what/action invalidos");
    }
    out.type = Type::CALIB;
    out.what = what;
    out.action = action;
    return true;
  }

  return setError(out, "UNKNOWN_CMD", "t='" + type + "'");
}

String Protocol::helloAck() {
  static JsonDocument doc;
  doc.clear();
  doc["t"] = "hello_ack";
  doc["v"] = PROTOCOL_VERSION;
  String out;
  out.reserve(64);
  serializeJson(doc, out);
  return out;
}

String Protocol::pong() {
  static JsonDocument doc;
  doc.clear();
  doc["t"] = "pong";
  doc["v"] = PROTOCOL_VERSION;
  String out;
  out.reserve(64);
  serializeJson(doc, out);
  return out;
}

String Protocol::ack(const char *of) {
  static JsonDocument doc;
  doc.clear();
  doc["t"] = "ack";
  doc["v"] = PROTOCOL_VERSION;
  doc["of"] = of;
  String out;
  out.reserve(96);
  serializeJson(doc, out);
  return out;
}

String Protocol::ack(const char *of, const char *value) {
  static JsonDocument doc;
  doc.clear();
  doc["t"] = "ack";
  doc["v"] = PROTOCOL_VERSION;
  doc["of"] = of;
  if (value) doc["value"] = value;
  String out;
  out.reserve(128);
  serializeJson(doc, out);
  return out;
}

String Protocol::ack(const char *of, int value) {
  return ack(of, String(value).c_str());
}

String Protocol::ack(const char *of, float value) {
  return ack(of, String(value, 1).c_str());
}

String Protocol::error(const char *code, const char *detail) {
  static JsonDocument doc;
  doc.clear();
  doc["t"] = "error";
  doc["v"] = PROTOCOL_VERSION;
  doc["code"] = code;
  doc["detail"] = detail ? detail : "";
  String out;
  out.reserve(160);
  serializeJson(doc, out);
  return out;
}

String Protocol::event(const char *code, const char *detail) {
  static JsonDocument doc;
  doc.clear();
  doc["t"] = "event";
  doc["v"] = PROTOCOL_VERSION;
  doc["ts"] = millis();
  doc["code"] = code;
  doc["detail"] = detail ? detail : "";
  String out;
  out.reserve(160);
  serializeJson(doc, out);
  return out;
}

String Protocol::telemetry(const TelemetryData &data) {
  static JsonDocument doc;
  doc.clear();

  doc["t"] = "telemetry";
  doc["v"] = PROTOCOL_VERSION;
  doc["ts"] = millis();
  doc["mode"] = data.mode ? data.mode : "idle";
  doc["conn"] = data.conn;

  JsonObject heading = doc["heading"].to<JsonObject>();
  heading["valid"] = data.headingValid;
  if (data.headingValid) {
    heading["actual"] = data.headingActual;
  } else {
    heading["actual"] = nullptr;
  }
  if (data.headingTargetValid) {
    heading["target"] = data.headingTarget;
  } else {
    heading["target"] = nullptr;
  }
  if (data.headingValid && data.headingTargetValid) {
    heading["error"] = data.headingError;
  } else {
    heading["error"] = nullptr;
  }

  JsonObject color = doc["color"].to<JsonObject>();
  color["name"] = data.colorName ? data.colorName : "desconocido";
  color["valid"] = data.colorValid;
  JsonArray rgb = color["rgb"].to<JsonArray>();
  rgb.add(data.colorR);
  rgb.add(data.colorG);
  rgb.add(data.colorB);

  JsonObject obstacle = doc["obstacle"].to<JsonObject>();
  obstacle["valid"] = data.obstacleValid;
  if (data.obstacleValid) {
    obstacle["distance_cm"] = data.obstacleDistanceCm;
  } else {
    obstacle["distance_cm"] = nullptr;
  }
  obstacle["blocked"] = data.obstacleBlocked;

  JsonObject obstacleLeft = doc["obstacle_left"].to<JsonObject>();
  obstacleLeft["valid"] = data.obstacleLeftValid;
  if (data.obstacleLeftValid) {
    obstacleLeft["distance_cm"] = data.obstacleLeftDistanceCm;
  } else {
    obstacleLeft["distance_cm"] = nullptr;
  }
  obstacleLeft["blocked"] = data.obstacleLeftBlocked;

  JsonObject obstacleRight = doc["obstacle_right"].to<JsonObject>();
  obstacleRight["valid"] = data.obstacleRightValid;
  if (data.obstacleRightValid) {
    obstacleRight["distance_cm"] = data.obstacleRightDistanceCm;
  } else {
    obstacleRight["distance_cm"] = nullptr;
  }
  obstacleRight["blocked"] = data.obstacleRightBlocked;

  JsonObject motors = doc["motors"].to<JsonObject>();
  motors["left"] = data.motorLeft;
  motors["right"] = data.motorRight;
  motors["state"] = data.motorState ? data.motorState : "stopped";

  JsonObject nav = doc["nav"].to<JsonObject>();
  nav["state"] = data.navState ? data.navState : "IDLE";
  nav["level"] = data.navLevel;
  if (data.navStrategy) nav["strategy"] = data.navStrategy;
  else                  nav["strategy"] = nullptr;

  doc["estop"] = data.estop;

  String out;
  out.reserve(768);
  serializeJson(doc, out);
  return out;
}

float Protocol::angleError(float target, float actual) {
  float diff = target - actual;
  while (diff > 180.0f) diff -= 360.0f;
  while (diff < -180.0f) diff += 360.0f;
  return diff;
}
