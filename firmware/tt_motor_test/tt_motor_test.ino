// ===========================================================================
// tt_motor_test - Banco de pruebas de los motores TT con TB6612FNG.
//
// Sketch SEPARADO del firmware de sensores. Solo se ejecuta si se carga a
// proposito. Sirve para verificar cableado, sentido de giro, PWM y STBY antes
// de integrar la navegacion.
//
// SEGURIDAD:
//   - Arranca con STBY en LOW (driver deshabilitado).
//   - Hay que enviar ARM de forma explicita para habilitar el driver.
//   - Cualquier movimiento se detiene y desarma tras MANUAL_MOVE_TIMEOUT_MS sin
//     un comando nuevo (deadman).
//   - STOP desarma inmediatamente.
//   - Levanta las ruedas del suelo antes de probar.
//
// Comandos: HELP, STATUS, ARM, DISARM, STOP, FWD, BACK, LEFT, RIGHT, L, R, TEST
// ===========================================================================

#include "../esp32s3_robot/Config.h"
#include "../esp32s3_robot/MotorDriver.h"
#include "../esp32s3_robot/MotorDriver.cpp"

MotorDriver motors;

namespace {

const uint32_t TEST_STEP_MS = 1500;
const uint32_t TEST_PAUSE_MS = 700;
const int TEST_SPEED_MIN = 20;
const int TEST_SPEED_MAX = 60;

enum TestPhase : uint8_t {
  TEST_NONE = 0,
  TEST_FWD,
  TEST_PAUSE1,
  TEST_BACK,
  TEST_PAUSE2,
  TEST_LEFT,
  TEST_PAUSE3,
  TEST_RIGHT
};

bool armed = false;
uint32_t lastCmdMs = 0;
int leftCmd = 0;
int rightCmd = 0;

TestPhase testPhase = TEST_NONE;
uint32_t testPhaseStart = 0;
int testSpeed = MANUAL_DEFAULT_SPEED;

String serialLine;

int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void printBanner() {
  Serial.println();
  Serial.println(F("====================================================="));
  Serial.println(F("  BANCO DE PRUEBAS - MOTORES TT + TB6612FNG"));
  Serial.print(F("  Firmware base: "));
  Serial.println(F(FIRMWARE_VERSION));
  Serial.println(F("  MOTORES DETENIDOS (STBY=LOW)"));
  Serial.println(F("====================================================="));
  Serial.println(F("Levanta las ruedas del suelo. Revisa 6 V, GND comun y STBY."));
}

void printHelp() {
  Serial.println(F("Comandos:"));
  Serial.println(F("  HELP              esta ayuda"));
  Serial.println(F("  STATUS            estado de armado y consignas"));
  Serial.println(F("  ARM               habilita el driver (STBY=HIGH)"));
  Serial.println(F("  DISARM | STOP     detiene y deshabilita (STBY=LOW)"));
  Serial.println(F("  FWD [0-100]       ambos motores adelante (def. 40)"));
  Serial.println(F("  BACK [0-100]      ambos motores atras"));
  Serial.println(F("  LEFT [0-100]      giro izquierda (izq. atras, der. adelante)"));
  Serial.println(F("  RIGHT [0-100]     giro derecha"));
  Serial.println(F("  L [-100..100]     solo motor izquierdo (signo = sentido)"));
  Serial.println(F("  R [-100..100]     solo motor derecho"));
  Serial.println(F("  TEST [20-60]      secuencia: fwd, back, left, right"));
  Serial.println(F("Deadman: 3 s sin comando -> STOP + DISARM."));
}

void printStatus() {
  Serial.print(F("[STATUS] armed="));
  Serial.print(armed ? F("YES") : F("NO"));
  Serial.print(F("  left="));
  Serial.print(leftCmd);
  Serial.print(F("%  right="));
  Serial.print(rightCmd);
  Serial.print(F("%  test="));
  switch (testPhase) {
    case TEST_NONE:   Serial.print(F("NO")); break;
    case TEST_FWD:    Serial.print(F("FWD")); break;
    case TEST_PAUSE1: Serial.print(F("PAUSE1")); break;
    case TEST_BACK:   Serial.print(F("BACK")); break;
    case TEST_PAUSE2: Serial.print(F("PAUSE2")); break;
    case TEST_LEFT:   Serial.print(F("LEFT")); break;
    case TEST_PAUSE3: Serial.print(F("PAUSE3")); break;
    case TEST_RIGHT:  Serial.print(F("RIGHT")); break;
  }
  Serial.println();
}

void stopAndDisarm() {
  motors.safeStop();
  armed = false;
  leftCmd = 0;
  rightCmd = 0;
  testPhase = TEST_NONE;
}

void stopMotion() {
  motors.stop();
  leftCmd = 0;
  rightCmd = 0;
  lastCmdMs = millis();
}

void applySpeeds(int left, int right) {
  if (!armed) {
    Serial.println(F("[ERROR] Driver deshabilitado. Envia ARM primero."));
    return;
  }
  leftCmd = clampInt(left, -100, 100);
  rightCmd = clampInt(right, -100, 100);
  motors.setLeft(leftCmd);
  motors.setRight(rightCmd);
  lastCmdMs = millis();

  Serial.print(F("[MOTOR] left="));
  Serial.print(leftCmd);
  Serial.print(F("% right="));
  Serial.print(rightCmd);
  Serial.println(F("%"));
}

void armDriver() {
  if (armed) {
    Serial.println(F("[ARM] Ya estaba armado."));
    return;
  }
  motors.enable();
  armed = true;
  leftCmd = 0;
  rightCmd = 0;
  lastCmdMs = millis();
  Serial.println(F("[ARM] STBY=HIGH. Driver habilitado. Ruedas levantadas."));
}

void startTest(int speed) {
  if (!armed) {
    Serial.println(F("[ERROR] TEST requiere ARM explicito."));
    return;
  }
  testSpeed = speed;
  testPhase = TEST_FWD;
  testPhaseStart = millis();
  applySpeeds(testSpeed, testSpeed);
  Serial.print(F("[TEST] Fase 1/7: adelante al "));
  Serial.print(testSpeed);
  Serial.println(F("%"));
}

void updateTest() {
  if (testPhase == TEST_NONE) return;

  uint32_t now = millis();
  uint32_t elapsed = now - testPhaseStart;

  switch (testPhase) {
    case TEST_FWD:
      if (elapsed >= TEST_STEP_MS) {
        stopMotion();
        testPhase = TEST_PAUSE1;
        testPhaseStart = now;
        Serial.println(F("[TEST] Pausa."));
      }
      break;

    case TEST_PAUSE1:
      if (elapsed >= TEST_PAUSE_MS) {
        testPhase = TEST_BACK;
        testPhaseStart = now;
        applySpeeds(-testSpeed, -testSpeed);
        Serial.println(F("[TEST] Fase 2/7: atras."));
      }
      break;

    case TEST_BACK:
      if (elapsed >= TEST_STEP_MS) {
        stopMotion();
        testPhase = TEST_PAUSE2;
        testPhaseStart = now;
        Serial.println(F("[TEST] Pausa."));
      }
      break;

    case TEST_PAUSE2:
      if (elapsed >= TEST_PAUSE_MS) {
        testPhase = TEST_LEFT;
        testPhaseStart = now;
        applySpeeds(-testSpeed, testSpeed);
        Serial.println(F("[TEST] Fase 3/7: giro izquierda."));
      }
      break;

    case TEST_LEFT:
      if (elapsed >= TEST_STEP_MS) {
        stopMotion();
        testPhase = TEST_PAUSE3;
        testPhaseStart = now;
        Serial.println(F("[TEST] Pausa."));
      }
      break;

    case TEST_PAUSE3:
      if (elapsed >= TEST_PAUSE_MS) {
        testPhase = TEST_RIGHT;
        testPhaseStart = now;
        applySpeeds(testSpeed, -testSpeed);
        Serial.println(F("[TEST] Fase 4/7: giro derecha."));
      }
      break;

    case TEST_RIGHT:
      if (elapsed >= TEST_STEP_MS) {
        stopAndDisarm();
        Serial.println(F("[TEST] Fin. Motores detenidos y driver deshabilitado."));
      }
      break;

    default:
      stopAndDisarm();
      break;
  }
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

  if (testPhase != TEST_NONE && verb != "STOP" && verb != "DISARM" &&
      verb != "STATUS" && verb != "HELP") {
    Serial.println(F("[TEST] Secuencia en curso. Usa STOP para abortar."));
    return;
  }

  if (verb == "HELP") {
    printHelp();
    return;
  }
  if (verb == "STATUS") {
    printStatus();
    return;
  }
  if (verb == "ARM") {
    armDriver();
    return;
  }
  if (verb == "STOP" || verb == "DISARM") {
    stopAndDisarm();
    Serial.println(F("[STOP] Motores detenidos. STBY=LOW (seguro)."));
    return;
  }
  if (verb == "TEST") {
    int speed = hasArg ? arg : MANUAL_DEFAULT_SPEED;
    startTest(clampInt(speed, TEST_SPEED_MIN, TEST_SPEED_MAX));
    return;
  }

  if (!armed) {
    Serial.println(F("[ERROR] Driver deshabilitado. Envia ARM primero."));
    return;
  }

  if (verb == "FWD" || verb == "BACK" || verb == "LEFT" || verb == "RIGHT") {
    int speed = hasArg ? arg : MANUAL_DEFAULT_SPEED;
    speed = clampInt(speed, 0, 100);
    if (speed == 0) {
      stopMotion();
      Serial.println(F("[MOTOR] Consigna 0: detenido (driver sigue armado)."));
      return;
    }
    if (verb == "FWD")        applySpeeds(speed, speed);
    else if (verb == "BACK")  applySpeeds(-speed, -speed);
    else if (verb == "LEFT")  applySpeeds(-speed, speed);
    else                      applySpeeds(speed, -speed);
    return;
  }

  if (verb == "L" || verb == "R") {
    int speed = hasArg ? arg : MANUAL_DEFAULT_SPEED;
    speed = clampInt(speed, -100, 100);
    if (verb == "L") applySpeeds(speed, 0);
    else             applySpeeds(0, speed);
    return;
  }

  Serial.print(F("[ERROR] Comando desconocido: "));
  Serial.println(verb);
  printHelp();
}

}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  uint32_t t0 = millis();
  while (!Serial && (millis() - t0) < 2000) {
    delay(10);
  }

  // Estado seguro ANTES de cualquier otra cosa.
  motors.begin();
  motors.safeStop();

  printBanner();
  printHelp();
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLine.length() > 0) {
        handleLine(serialLine);
        serialLine = "";
      }
    } else if (serialLine.length() < 96) {
      serialLine += c;
    }
  }

  updateTest();

  // Deadman solo fuera de la secuencia TEST.
  if (testPhase == TEST_NONE && armed) {
    bool moving = (leftCmd != 0 || rightCmd != 0);
    uint32_t timeout = moving ? MANUAL_MOVE_TIMEOUT_MS : MANUAL_ARM_TIMEOUT_MS;
    if ((millis() - lastCmdMs) > timeout) {
      stopAndDisarm();
      if (moving) {
        Serial.println(F("[DEADMAN] 3 s sin comando en movimiento: motores detenidos y driver deshabilitado."));
      } else {
        Serial.println(F("[DEADMAN] 10 s armado sin comandos: driver deshabilitado."));
      }
    }
  }
}
