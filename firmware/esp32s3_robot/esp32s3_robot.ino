// ===========================================================================
// Robot movil inteligente ESP32-S3
// Fase 4: bring-up de sensores.
//
// Estado de motores: SIEMPRE seguro (STBY en bajo, detenidos). Esta fase solo
// lee sensores y responde por el monitor serie; NO mueve el robot.
//
//  - Banner + escaneo I2C.
//  - Brujula QMC5883L (rumbo), color TCS34725 (clasificacion),
//    HC-SR04 (distancia, sin bloqueo) y encoders.
//  - Comandos serie: PING, SCAN, STATUS, SENSORS, CAL-COMPASS, CAL-ZERO.
// ===========================================================================

#include <Wire.h>
#include "Config.h"
#include "Diagnostics.h"
#include "MotorDriver.h"
#include "Compass.h"
#include "ColorSensor.h"
#include "ObstacleSensor.h"
#include "Encoder.h"

MotorDriver   motors;
Compass       compass;
ColorSensor   color;
ObstacleSensor obstacle;
Encoder       encL;
Encoder       encR;

uint32_t lastHeartbeat = 0;
String serialLine;

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

  // Obstaculo
  Serial.print(F("Distancia: "));
  if (obstacle.isValid()) {
    Serial.print(obstacle.distanceCm(), 1);
    Serial.print(F(" cm"));
    if (obstacle.isBlocked()) Serial.print(F("  [BLOQUEADO]"));
    Serial.println();
  } else {
    Serial.println(F("sin eco / fuera de rango"));
  }

  // Encoders
  Serial.print(F("Encoders: izq="));
  Serial.print(encL.count());
  Serial.print(F("  der="));
  Serial.print(encR.count());
  if (!encL.pprConfigured()) Serial.print(F("  (PPR sin definir: sin rpm)"));
  Serial.println();
}

void handleLine(const String &line) {
  String cmd = line;
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.equalsIgnoreCase("PING")) {
    Serial.print(F("PONG "));
    Serial.println(F(FIRMWARE_VERSION));
  } else if (cmd.equalsIgnoreCase("SCAN")) {
    Diagnostics::scanI2C();
  } else if (cmd.equalsIgnoreCase("STATUS")) {
    Serial.print(F("STATUS,mode=DETENIDO,stby="));
    Serial.println(motors.isEnabled() ? F("HIGH") : F("LOW"));
  } else if (cmd.equalsIgnoreCase("SENSORS")) {
    printSensors();
  } else if (cmd.equalsIgnoreCase("CAL-ZERO")) {
    encL.reset();
    encR.reset();
    Serial.println(F("OK, encoders a cero"));
  } else {
    Serial.print(F("ERROR,UNKNOWN_CMD,"));
    Serial.println(cmd);
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);

  uint32_t t0 = millis();
  while (!Serial && (millis() - t0) < 2000) { delay(10); }

  Diagnostics::printBanner();

  // Estado seguro de motores ANTES de cualquier otra cosa.
  motors.begin();
  motors.safeStop();
  Serial.println(F("[MOTOR] Estado seguro: STBY=LOW, motores detenidos."));

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
  Serial.println(F("  HC-SR04          : configurado (no bloqueante)"));

  encL.begin(0);
  encR.begin(1);
  Serial.println(F("  Encoders         : configurados"));

  Serial.println(F("[SYS] Listo. Comandos: PING, SCAN, STATUS, SENSORS, CAL-ZERO"));
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

  uint32_t now = millis();
  uint32_t nowUs = micros();

  // Actualizacion no bloqueante de sensores.
  compass.update(now);
  color.update(now);
  obstacle.update(nowUs);
  encL.update(now);
  encR.update(now);

  // Latido periodico.
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    Diagnostics::heartbeat(now);
  }
}
