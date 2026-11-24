// ===========================================================================
// Robot movil inteligente ESP32-S3
// Fase 6: sensores + control manual por serie + servidor WiFi/WebSocket.
//
// Motores: arrancan en estado seguro (STBY=LOW). El movimiento requiere ARM
// explicito por serie o un drive valido por WebSocket. El deadman detiene y
// desarma si no llegan comandos. La app usa ws://192.168.4.1:81 (AP propio).
// ===========================================================================

#include <Wire.h>
#include "Config.h"
#include "Diagnostics.h"
#include "MotorDriver.h"
#include "ControlManual.h"
#include "FSMGlobal.h"
#include "Compass.h"
#include "ColorSensor.h"
#include "ObstacleSensor.h"
#include "Encoder.h"
#include "Protocol.h"
#include "Telemetry.h"
#include "Wireless.h"
#include "Navigator.h"

MotorDriver   motors;
ControlManual manual;
FSMGlobal     fsm;
Compass       compass;
ColorSensor   color;
ObstacleSensor obstacle(SONAR_FRONT_TRIG_PIN, SONAR_FRONT_ECHO_PIN, 0);
ObstacleSensor obstacleLeft(SONAR_LEFT_TRIG_PIN, SONAR_LEFT_ECHO_PIN, SONAR_STAGGER_US / 1000);
ObstacleSensor obstacleRight(SONAR_RIGHT_TRIG_PIN, SONAR_RIGHT_ECHO_PIN, 2 * SONAR_STAGGER_US / 1000);
Encoder       encL;
Encoder       encR;
Wireless      wireless;
Navigator     navigator;

uint32_t lastHeartbeat = 0;
uint32_t lastTelemetry = 0;
uint32_t estopButtonSince = 0;
String serialLine;

void printObstacle(const __FlashStringHelper *label, const ObstacleSensor &sensor) {
  Serial.print(label);
  if (sensor.isValid()) {
    Serial.print(sensor.distanceCm(), 1);
    Serial.print(F(" cm"));
    if (sensor.isBlocked()) Serial.print(F("  [BLOQUEADO]"));
    Serial.println();
  } else {
    Serial.println(F("sin eco / fuera de rango"));
  }
}

void printSensors() {
  Serial.println(F("---- Sensores ----"));

  // Brujula
  Serial.print(F("Brujula : "));
  if (compass.isValid()) {
    Serial.print(F("rumbo="));
    Serial.print(compass.headingDeg(), 1);
    Serial.print(F(" deg  (raw "));
    Serial.print(compass.rawX()); Serial.print(',');
    Serial.print(compass.rawY()); Serial.print(',');
    Serial.print(compass.rawZ()); Serial.print(')');
    Serial.println(compass.isCalibrated() ? F("  [calibrada]") : F("  [sin calibrar]"));
  } else {
    Serial.println(compass.overflow() ? F("OVERFLOW / no fiable") : F("sin lectura valida"));
  }

  // Color
  Serial.print(F("Color   : "));
  if (color.isValid()) {
    Serial.print(colorName(color.color()));
    Serial.print(F("  rgb=("));
    Serial.print(color.red()); Serial.print(',');
    Serial.print(color.green()); Serial.print(',');
    Serial.print(color.blue()); Serial.print(F(") clear="));
    Serial.println(color.clear());
  } else {
    Serial.println(F("sin lectura valida"));
  }

  // Obstaculos
  printObstacle(F("Dist. frontal : "), obstacle);
  printObstacle(F("Dist. izquierda: "), obstacleLeft);
  printObstacle(F("Dist. derecha  : "), obstacleRight);

  // Encoders
  Serial.print(F("Encoders: izq="));
  Serial.print(encL.count());
  Serial.print(F("  der="));
  Serial.print(encR.count());
  if (!encL.pprConfigured()) Serial.print(F("  (PPR sin definir: sin rpm)"));
  Serial.println();
}

int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void printHelp() {
  Serial.println(F("Comandos:"));
  Serial.println(F("  HELP              esta ayuda"));
  Serial.println(F("  PING              comprueba comunicacion"));
  Serial.println(F("  SCAN              escaneo I2C"));
  Serial.println(F("  STATUS            estado de motores, modo y enlace"));
  Serial.println(F("  NET               estado WiFi/WebSocket"));
  Serial.println(F("  SENSORS           lectura puntual de sensores"));
  Serial.println(F("  CAL-ZERO          encoders a cero"));
  Serial.println(F("  ARM               habilita el driver (STBY=HIGH)"));
  Serial.println(F("  DISARM | STOP     detiene y deshabilita (STBY=LOW)"));
  Serial.println(F("  FWD [0-100]       ambos motores adelante (def. 40)"));
  Serial.println(F("  BACK [0-100]      ambos motores atras"));
  Serial.println(F("  LEFT [0-100]      giro izquierda (izq. atras, der. adelante)"));
  Serial.println(F("  RIGHT [0-100]     giro derecha"));
  Serial.println(F("  L [-100..100]     solo motor izquierdo (signo = sentido)"));
  Serial.println(F("  R [-100..100]     solo motor derecho"));
  Serial.println(F("  AUTO EVADIR|RUMBO|LINEA  modo autonomo con ese submodo"));
  Serial.println(F("  HEAD [0-359]      fija el rumbo deseado; HEAD sin arg lo borra"));
  Serial.print(F("Deadman: serie "));
  Serial.print(MANUAL_MOVE_TIMEOUT_MS / 1000);
  Serial.print(F(" s / WebSocket "));
  Serial.print(COMMAND_TTL_MS);
  Serial.print(F(" ms sin comando; "));
  Serial.print(MANUAL_ARM_TIMEOUT_MS / 1000);
  Serial.println(F(" s armado sin usar."));
}

void printStatus() {
  Serial.print(F("STATUS,mode="));
  Serial.print(fsm.stateLabel());
  Serial.print(F(",armed="));
  Serial.print(manual.isArmed() ? F("YES") : F("NO"));
  Serial.print(F(",stby="));
  Serial.print(motors.isEnabled() ? F("HIGH") : F("LOW"));
  Serial.print(F(",left="));
  Serial.print(manual.leftCmd());
  Serial.print(F("%,right="));
  Serial.print(manual.rightCmd());
  Serial.print(F("%,estop="));
  Serial.print(fsm.isEstop() ? F("YES") : F("NO"));
  Serial.print(F(",clients="));
  Serial.println(wireless.clientCount());
}

void printMotorState() {
  Serial.print(F("[MOTOR] left="));
  Serial.print(manual.leftCmd());
  Serial.print(F("% right="));
  Serial.print(manual.rightCmd());
  Serial.println(F("%"));
}

TelemetryData makeTelemetry() {
  TelemetryData d = Telemetry::snapshot(compass, color, obstacle, obstacleLeft, obstacleRight, manual, fsm);
  if (fsm.isAuto() && !fsm.isEstop()) {
    d.navState = navigator.stateName();   // sub-estado del piloto autonomo
    d.navStrategy = navigator.strategyName();
  }
  return d;
}

void broadcastTelemetry() {
  if (!wireless.hasClients()) return;
  wireless.broadcast(Protocol::telemetry(makeTelemetry()));
}

void sendTelemetryTo(uint8_t clientNum) {
  wireless.sendTo(clientNum, Protocol::telemetry(makeTelemetry()));
}

void sendErrorTo(uint8_t clientNum, const char *code, const char *detail) {
  wireless.sendTo(clientNum, Protocol::error(code, detail));
  Serial.print(F("[WS] Error "));
  Serial.print(code);
  Serial.print(F(": "));
  Serial.println(detail);
}

void handleWsConnect(uint8_t clientNum) {
  sendTelemetryTo(clientNum);
}

static bool driveUntilActive = false;
static float driveUntilStopCm = OBSTACLE_APPROACH_STOP_CM;
static uint32_t driveUntilDeadlineMs = 0;
static uint32_t driveUntilLastCmdMs = 0;
static uint32_t driveUntilInvalidSinceMs = 0;   // 0 = sensor frontal con lectura

static void clearDriveUntil() {
  driveUntilActive = false;
  driveUntilInvalidSinceMs = 0;
  driveUntilStopCm = OBSTACLE_APPROACH_STOP_CM;
  driveUntilDeadlineMs = 0;
  driveUntilLastCmdMs = 0;
}

void handleWsText(uint8_t clientNum, const char *payload) {
  Protocol::Command cmd;
  if (!Protocol::parse(payload, cmd)) {
    sendErrorTo(clientNum, cmd.errorCode.c_str(), cmd.errorDetail.c_str());
    return;
  }

  switch (cmd.type) {
    case Protocol::Type::HELLO:
      wireless.sendTo(clientNum, Protocol::helloAck());
      break;

    case Protocol::Type::PING:
      wireless.sendTo(clientNum, Protocol::pong());
      break;

    case Protocol::Type::STATUS:
      sendTelemetryTo(clientNum);
      break;

    case Protocol::Type::MODE:
      if (fsm.isEstop()) {
        sendErrorTo(clientNum, "SAFETY", "estop activo");
        break;
      }
      if (cmd.mode == "manual") {
        if (fsm.setManual()) {
          wireless.sendTo(clientNum, Protocol::ack("mode", "manual"));
          Serial.println(F("[WS] Modo manual"));
        } else {
          sendErrorTo(clientNum, "SAFETY", "no se pudo entrar en manual");
        }
      } else {
        Navigator::Strategy strategy = Navigator::EVADIR_SOLO;
        if (cmd.strategy == "rumbo")      strategy = Navigator::RUMBO;
        else if (cmd.strategy == "linea") strategy = Navigator::LINEA;
        if (strategy == Navigator::RUMBO && !cmd.hasDeg && !fsm.hasHeadingTarget()) {
          sendErrorTo(clientNum, "BAD_FORMAT", "submodo rumbo sin rumbo deseado");
          break;
        }
        clearDriveUntil();
        if (fsm.setAutonomo()) {
          if (cmd.hasDeg) fsm.setHeadingTarget(cmd.deg);
          navigator.reset(millis(), strategy);
          wireless.sendTo(clientNum, Protocol::ack("mode", "autonomo"));
          Serial.print(F("[WS] Modo autonomo, submodo "));
          Serial.println(navigator.strategyName());
          broadcastTelemetry();
        } else {
          sendErrorTo(clientNum, "SAFETY", "no se pudo entrar en autonomo");
        }
      }
      break;

    case Protocol::Type::DRIVE:
      if (fsm.isEstop()) {
        sendErrorTo(clientNum, "SAFETY", "estop activo");
        break;
      }
      if (cmd.dir == "stop") {
        clearDriveUntil();
        // En AUTONOMO el Navigator volveria a mover el robot en 50 ms: "detener"
        // sale del modo (IDLE, driver desarmado).
        if (fsm.isAuto()) fsm.setIdle();
        else              manual.stopMotion();
        wireless.sendTo(clientNum, Protocol::ack("drive", "stop"));
        broadcastTelemetry();
        break;
      }
      if (fsm.isAuto()) {
        sendErrorTo(clientNum, "UNSUPPORTED", "drive en modo autonomo");
        break;
      }
      if (!fsm.isManual() || !manual.isArmed()) {
        if (!fsm.setManual()) {
          sendErrorTo(clientNum, "SAFETY", "no se pudo armar el driver");
          break;
        }
      }
      {
        bool ok = false;
        if (cmd.until == "front_obstacle") {
          if (!obstacle.isValid()) {
            sendErrorTo(clientNum, "SENSOR_INVALID", "obstaculo frontal sin lectura valida");
            break;
          }
          if (obstacle.distanceCm() <= cmd.stopCm) {
            clearDriveUntil();
            manual.stopMotion();
            wireless.sendTo(clientNum, Protocol::ack("drive", "stop"));
            wireless.broadcast(Protocol::event("OBSTACLE_REACHED", "obstaculo frontal"));
            broadcastTelemetry();
            break;
          }
          driveUntilLastCmdMs = millis();
          // La app reenvia la orden cada 200 ms: el tope max_ms cuenta desde la primera.
          if (!driveUntilActive) driveUntilDeadlineMs = driveUntilLastCmdMs + cmd.maxMs;
          driveUntilActive = true;
          driveUntilStopCm = cmd.stopCm;
          ok = manual.forward(cmd.speed, COMMAND_TTL_MS);
        } else {
          clearDriveUntil();
          if (cmd.dir == "fwd")        ok = manual.forward(cmd.speed, COMMAND_TTL_MS);
          else if (cmd.dir == "back")  ok = manual.back(cmd.speed, COMMAND_TTL_MS);
          else if (cmd.dir == "left")  ok = manual.turnLeft(cmd.speed, COMMAND_TTL_MS);
          else if (cmd.dir == "right") ok = manual.turnRight(cmd.speed, COMMAND_TTL_MS);
        }
        if (!ok) {
          clearDriveUntil();
          sendErrorTo(clientNum, "SAFETY", "no se pudo aplicar la consigna");
          break;
        }
        wireless.sendTo(clientNum, Protocol::ack("drive", cmd.dir.c_str()));
        broadcastTelemetry();
      }
      break;

    case Protocol::Type::HEADING:
      if (fsm.isEstop()) {
        sendErrorTo(clientNum, "SAFETY", "estop activo");
        break;
      }
      fsm.setHeadingTarget(cmd.deg);
      wireless.sendTo(clientNum, Protocol::ack("heading", cmd.deg));
      broadcastTelemetry();
      break;

    case Protocol::Type::CALIB:
      sendErrorTo(clientNum, "UNSUPPORTED", "calibracion no implementada");
      break;

    case Protocol::Type::ESTOP:
      fsm.estop();
      wireless.sendTo(clientNum, Protocol::ack("estop"));
      wireless.broadcast(Protocol::event("ESTOP", "parada de emergencia"));
      broadcastTelemetry();
      Serial.println(F("[WS] ESTOP activado"));
      break;

    default:
      sendErrorTo(clientNum, "UNKNOWN_CMD", "comando no soportado");
      break;
  }
}

void updateEstopButton(uint32_t now) {
  if (fsm.isEstop()) return;
  bool pressed = digitalRead(ESTOP_BUTTON_PIN) == LOW;
  if (!pressed) {
    estopButtonSince = 0;
    return;
  }
  if (estopButtonSince == 0) {
    estopButtonSince = now;
    return;
  }
  if ((uint32_t)(now - estopButtonSince) >= 50) {
    fsm.estop();
    Serial.println(F("[ESTOP] Boton fisico activado. Motores detenidos."));
    wireless.broadcast(Protocol::event("ESTOP", "boton fisico"));
    broadcastTelemetry();
  }
}

void printNetwork() {
  Serial.print(F("NET,ap="));
  Serial.print(wireless.apActive() ? F("YES") : F("NO"));
  Serial.print(F(",ssid="));
  Serial.print(F(WIFI_AP_SSID));
  Serial.print(F(",ip="));
  Serial.print(wireless.ipAddress());
  Serial.print(F(",ws_port="));
  Serial.print(WS_PORT);
  Serial.print(F(",sta="));
  Serial.print(wireless.staConnected() ? F("YES") : F("NO"));
  if (wireless.staConnected()) {
    Serial.print(F(",sta_ip="));
    Serial.print(wireless.staIpAddress());
  }
  Serial.print(F(",clients="));
  Serial.println(wireless.clientCount());
}

void handleLine(const String &line) {
  String cmd = line;
  cmd.trim();
  if (cmd.length() == 0) return;

  int space = cmd.indexOf(' ');
  String verb = (space < 0) ? cmd : cmd.substring(0, space);
  bool hasArg = (space >= 0);
  int arg = hasArg ? cmd.substring(space + 1).toInt() : 0;
  verb.toUpperCase();

  if (verb == "HELP") {
    printHelp();
    return;
  }
  if (verb == "PING") {
    Serial.print(F("PONG "));
    Serial.println(F(FIRMWARE_VERSION));
    return;
  }
  if (verb == "SCAN") {
    Diagnostics::scanI2C();
    return;
  }
  if (verb == "STATUS") {
    printStatus();
    return;
  }
  if (verb == "NET" || verb == "WIFI" || verb == "WS") {
    printNetwork();
    return;
  }
  if (verb == "SENSORS") {
    printSensors();
    return;
  }
  if (verb == "CAL-ZERO") {
    encL.reset();
    encR.reset();
    Serial.println(F("OK, encoders a cero"));
    return;
  }
  if (verb == "ARM") {
    if (fsm.isEstop()) {
      Serial.println(F("[ERROR] E-stop activo. Reinicia la placa."));
      return;
    }
    if (manual.isArmed()) {
      Serial.println(F("[ARM] Ya estaba armado."));
      return;
    }
    if (fsm.setManual()) {
      Serial.println(F("[ARM] STBY=HIGH. Driver habilitado. Ruedas levantadas."));
    } else {
      Serial.println(F("[ERROR] No se pudo armar el driver."));
    }
    return;
  }
  if (verb == "STOP" || verb == "DISARM") {
    fsm.setIdle();
    if (fsm.isEstop()) {
      Serial.println(F("[STOP] E-stop sigue activo. Reinicia la placa."));
    } else {
      Serial.println(F("[STOP] Motores detenidos. STBY=LOW (seguro)."));
    }
    return;
  }

  if (verb == "AUTO") {
    String arg1 = hasArg ? cmd.substring(space + 1) : String();
    arg1.trim();
    arg1.toUpperCase();
    Navigator::Strategy strategy;
    if (arg1 == "EVADIR")     strategy = Navigator::EVADIR_SOLO;
    else if (arg1 == "RUMBO") strategy = Navigator::RUMBO;
    else if (arg1 == "LINEA") strategy = Navigator::LINEA;
    else {
      Serial.println(F("[ERROR] Uso: AUTO EVADIR | AUTO RUMBO | AUTO LINEA"));
      return;
    }
    if (strategy == Navigator::RUMBO && !fsm.hasHeadingTarget()) {
      Serial.println(F("[ERROR] Fija antes el rumbo deseado: HEAD 0-359"));
      return;
    }
    clearDriveUntil();
    if (fsm.setAutonomo()) {
      navigator.reset(millis(), strategy);
      Serial.print(F("[AUTO] Modo autonomo, submodo "));
      Serial.print(navigator.strategyName());
      Serial.println(F(". STOP para salir."));
    } else {
      Serial.println(F("[ERROR] No se pudo entrar en autonomo (E-stop?)."));
    }
    return;
  }
  if (verb == "HEAD") {
    if (!hasArg) {
      fsm.clearHeadingTarget();
      Serial.println(F("[HEAD] Rumbo deseado borrado."));
    } else {
      fsm.setHeadingTarget((float)clampInt(arg, 0, 359));
      Serial.print(F("[HEAD] Rumbo deseado = "));
      Serial.println(fsm.headingTarget(), 1);
    }
    return;
  }

  if (verb == "FWD" || verb == "BACK" || verb == "LEFT" || verb == "RIGHT") {
    if (fsm.isEstop()) {
      Serial.println(F("[ERROR] E-stop activo. Reinicia la placa."));
      return;
    }
    // Ya no se requiere enviar ARM manually - se arma automáticamente en modo manual
    // if (!manual.isArmed()) {
    //   Serial.println(F("[ERROR] Driver deshabilitado. Envia ARM primero."));
    //   return;
    // }
    int speed = hasArg ? arg : MANUAL_DEFAULT_SPEED;
    speed = clampInt(speed, 0, 100);
    if (speed == 0) {
      manual.stopMotion();
      Serial.println(F("[MOTOR] Consigna 0: detenido (driver sigue armado)."));
      return;
    }

    bool ok = false;
    if (verb == "FWD")        ok = manual.forward(speed);
    else if (verb == "BACK")  ok = manual.back(speed);
    else if (verb == "LEFT")  ok = manual.turnLeft(speed);
    else                      ok = manual.turnRight(speed);

    if (ok) {
      printMotorState();
    } else {
      Serial.println(F("[ERROR] No se pudo aplicar la consigna."));
    }
    return;
  }

  if (verb == "L" || verb == "R") {
    if (fsm.isEstop()) {
      Serial.println(F("[ERROR] E-stop activo. Reinicia la placa."));
      return;
    }
    // Ya no se requiere enviar ARM manualmente - searma automáticamente en modo manual
    // if (!manual.isArmed()) {
    //   Serial.println(F("[ERROR] Driver deshabilitado. Envia ARM primero."));
    //   return;
    // }
    int speed = hasArg ? arg : MANUAL_DEFAULT_SPEED;
    speed = clampInt(speed, -100, 100);
    bool ok = (verb == "L") ? manual.setWheels(speed, 0)
                            : manual.setWheels(0, speed);
    if (ok) {
      printMotorState();
    } else {
      Serial.println(F("[ERROR] No se pudo aplicar la consigna."));
    }
    return;
  }

  Serial.print(F("ERROR,UNKNOWN_CMD,"));
  Serial.println(cmd);
}

void setup() {
  Serial.begin(SERIAL_BAUD);

  uint32_t t0 = millis();
  while (!Serial && (millis() - t0) < 2000) { delay(10); }

  Diagnostics::printBanner();

  // Estado seguro de motores ANTES de cualquier otra cosa.
  manual.begin(&motors);
  fsm.begin(&manual);
  pinMode(ESTOP_BUTTON_PIN, INPUT_PULLUP);
  Serial.println(F("[MOTOR] Estado seguro: STBY=LOW, motores detenidos."));
  Serial.print(F("[SAFE] Boton de emergencia en GPIO "));
  Serial.println(ESTOP_BUTTON_PIN);

  // Bus I2C
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, I2C_FREQUENCY_HZ);
  Serial.print(F("[I2C] Iniciado en SDA="));
  Serial.print(I2C_SDA_PIN);
  Serial.print(F(", SCL="));
  Serial.println(I2C_SCL_PIN);
  Diagnostics::scanI2C();

  // Sensores
  Serial.println(F("[SENS] Inicializando sensores..."));
  Serial.print(F("  Brujula QMC5883L : "));
  Serial.println(compass.begin() ? F("OK") : F("NO RESPONDE"));
  Serial.print(F("  Color TCS34725   : "));
  Serial.println(color.begin() ? F("OK") : F("NO RESPONDE"));

  obstacle.begin();
  obstacleLeft.begin();
  obstacleRight.begin();
  Serial.println(F("  HC-SR04          : frontal/izq/der configurados (no bloqueante)"));

  encL.begin(0);
  encR.begin(1);
  Serial.println(F("  Encoders         : configurados"));

  wireless.onText(handleWsText);
  wireless.onConnect(handleWsConnect);
  wireless.begin(WIFI_STA_SSID, WIFI_STA_PASS);

  Serial.println(F("[SYS] Listo. Escribe HELP para ver los comandos."));
}

void loop() {
  // Lectura serie no bloqueante, linea a linea.
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLine.length() > 0) {
        handleLine(serialLine);
        serialLine = "";
      }
    } else {
      if (serialLine.length() < 128) serialLine += c;
    }
  }

  wireless.update();

  uint32_t now = millis();
  uint32_t nowUs = micros();

  // Actualizacion no bloqueante de sensores.
  compass.update(now);
  color.update(now);
  obstacle.update(nowUs);
  obstacleLeft.update(nowUs);
  obstacleRight.update(nowUs);
  encL.update(now);
  encR.update(now);

#if MANUAL_AUTO_AVOID
  // --- Evitador de obstáculos automático (solo cuando NO hay conducción activa) ---
  // Si el usuario está enviando comandos (FWD/BACK/LEFT/RIGHT), el evitador se desactiva
  // para no interferir con el control manual. Solo actúa cuando el robot está quieto
  // o con comandos nulos.
  static uint32_t lastAvoidanceUs = 0;
  const uint32_t avoidancePeriodUs = 50000; // 50 ms entre verificaciones de obstáculos

  bool userDriving = manual.isMoving();  // true si hay izquierda/dercha distinta de 0
  
  if (fsm.isManual() && !fsm.isEstop() && !userDriving && (uint32_t)(now - lastAvoidanceUs) >= avoidancePeriodUs) {
    bool frontBlocked = obstacle.isBlocked();
    bool leftBlocked = obstacleLeft.isBlocked();
    bool rightBlocked = obstacleRight.isBlocked();

    if (frontBlocked && !leftBlocked && !rightBlocked) {
      // Camino libre a los laterales: girar al lado con más espacio
      if (!obstacleLeft.isValid() || obstacleLeft.distanceCm() > obstacleRight.distanceCm()) {
        manual.turnLeft(40, 0); // Girar izquierda
      } else {
        manual.turnRight(40, 0); // Girar derecha
      }
    } else if (frontBlocked && leftBlocked && !rightBlocked) {
      // Izquierda bloqueada, derecha libre: girar derecha
      manual.turnRight(50, 300); // Girar derecha por 300ms
    } else if (frontBlocked && !leftBlocked && rightBlocked) {
      // Derecha bloqueada, izquierda libre: girar izquierda
      manual.turnLeft(50, 300); // Girar izquierda por 300ms
    } else if (frontBlocked && leftBlocked && rightBlocked) {
      // Los tres bloqueados: detenerse y retroceder un poco
      manual.stopMotion();
      manual.back(30, 500); // Retroceder 500ms
    } else if (!frontBlocked && (leftBlocked || rightBlocked)) {
      // Libre adelante, un lateral bloqueado: continuar adelante
      // (no hacer nada, dejar que el control manual siga)
    }
    lastAvoidanceUs = now;
  }

#endif // MANUAL_AUTO_AVOID

  if (driveUntilActive) {
    // Cuenta cuanto tiempo lleva el sensor frontal sin lectura valida.
    if (obstacle.isValid())                 driveUntilInvalidSinceMs = 0;
    else if (driveUntilInvalidSinceMs == 0) driveUntilInvalidSinceMs = now ? now : 1;

    if (!fsm.isManual() || fsm.isEstop()) {
      clearDriveUntil();
    } else if (obstacle.isValid() && obstacle.distanceCm() <= driveUntilStopCm) {
      clearDriveUntil();
      manual.stopMotion();
      wireless.broadcast(Protocol::event("OBSTACLE_REACHED", "obstaculo frontal"));
      broadcastTelemetry();
    } else if (driveUntilInvalidSinceMs != 0 &&
               (now - driveUntilInvalidSinceMs) >= DRIVE_UNTIL_SENSOR_LOST_MS) {
      // Sin lectura frontal: avanzar a ciegas podria chocar.
      clearDriveUntil();
      manual.stopMotion();
      wireless.broadcast(Protocol::event("SENSOR_LOST", "obstaculo frontal sin lectura"));
      broadcastTelemetry();
    } else if ((int32_t)(now - driveUntilDeadlineMs) >= 0) {
      clearDriveUntil();
      manual.stopMotion();
      wireless.broadcast(Protocol::event("DRIVE_TIMEOUT", "front_obstacle"));
      broadcastTelemetry();
    } else if ((int32_t)(now - driveUntilLastCmdMs) > (int32_t)(COMMAND_TTL_MS + 150)) {
      clearDriveUntil();
      manual.stopMotion();
      wireless.broadcast(Protocol::event("DRIVE_TIMEOUT", "client_deadman"));
      broadcastTelemetry();
    }
  }

// Deadman del control manual.
  ControlManual::Event ev = fsm.update(now);
  if (ev == ControlManual::EVENT_MOVE_TIMEOUT) {
    clearDriveUntil();
    Serial.print(F("[DEADMAN] "));
    Serial.print(manual.moveTimeoutMs());
    Serial.println(F(" ms sin comando en movimiento: motores detenidos y driver deshabilitado."));
    wireless.broadcast(Protocol::event("MOVE_TIMEOUT", "deadman: motores detenidos"));
    broadcastTelemetry();
  } else if (ev == ControlManual::EVENT_ARM_TIMEOUT) {
    clearDriveUntil();
    Serial.print(F("[DEADMAN] "));
    Serial.print(MANUAL_ARM_TIMEOUT_MS / 1000);
    Serial.println(F(" s armado sin comandos: driver deshabilitado."));
    wireless.broadcast(Protocol::event("ARM_TIMEOUT", "driver deshabilitado"));
    broadcastTelemetry();
  }

  updateEstopButton(now);

  // --- MODO AUTÓNOMO (Navigator) ---
  // Tres submodos elegidos por el usuario: solo evadir, rumbo o línea
  // (ver Navigator.h). Todos esquivan obstáculos.
  if (fsm.isAuto() && !fsm.isEstop()) {
    static uint32_t lastAutoMs = 0;
    static uint8_t lastNavState = 0xFF;

    if (now - lastAutoMs >= AUTO_DECISION_MS) {
      lastAutoMs = now;

      // Al entrar en AUTONOMO el FSM desarma el driver: hay que armarlo
      // para que las consignas de motor realmente muevan el robot.
      if (!manual.isArmed()) manual.arm();

      const ColorName c = color.color();
      NavInput in;
      in.headingValid = compass.isValid();
      in.heading      = compass.headingDeg();
      in.targetValid  = fsm.hasHeadingTarget();
      in.target       = fsm.headingTarget();
      in.frontBlocked = obstacle.isBlocked();
      in.leftBlocked  = obstacleLeft.isBlocked();
      in.rightBlocked = obstacleRight.isBlocked();
      in.leftValid    = obstacleLeft.isValid();
      in.rightValid   = obstacleRight.isValid();
      in.leftCm       = obstacleLeft.distanceCm();
      in.rightCm      = obstacleRight.distanceCm();
      in.onColor      = color.isValid() && c != ColorName::BLANCO && c != ColorName::DESCONOCIDO;

      const NavOutput out = navigator.step(in, now);
      manual.setWheels(out.left, out.right, AUTO_CMD_TTL_MS);

      if (navigator.state() != lastNavState) {
        lastNavState = navigator.state();
        Serial.print(F("[NAV] "));
        Serial.println(navigator.stateName());
        wireless.broadcast(Protocol::event("NAV_STATE", navigator.stateName()));
      }
    }
  }

  if (now - lastTelemetry >= TELEMETRY_PERIOD_MS) {
    lastTelemetry = now;
    broadcastTelemetry();
  }

  // Latido periodico.
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    Diagnostics::heartbeat(now, manual.isArmed());
  }
}
