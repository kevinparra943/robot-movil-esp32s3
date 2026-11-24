#ifndef CONTROL_MANUAL_H
#define CONTROL_MANUAL_H

#include <Arduino.h>
#include "Config.h"
#include "MotorDriver.h"

// Control manual del robot sobre el driver TB6612.
//
// Seguridad:
//   - begin() deja el driver en STBY=LOW (detenido).
//   - Hay que llamar a arm() de forma explicita para permitir movimiento.
//   - disarm() detiene y baja STBY.
//   - update() aplica el deadman: si no llega una consigna nueva, detiene y
//     desarma. Devuelve el evento para que la capa superior lo registre.
class ControlManual {
public:
  enum Event : uint8_t {
    EVENT_NONE = 0,
    EVENT_MOVE_TIMEOUT,
    EVENT_ARM_TIMEOUT
  };

  // Inicializa el driver en estado seguro y deja el control desarmado.
  void begin(MotorDriver *driver);

  // Habilita el driver (STBY=HIGH). Devuelve false si ya estaba armado.
  bool arm();

  // Detiene los motores y baja STBY (estado seguro total).
  void disarm();

  // Detiene los motores sin desarmar (STBY sigue en HIGH).
  void stopMotion();

  // Consignas. Devuelven false si el driver no esta armado.
  bool setWheels(int left, int right);
  bool setWheels(int left, int right, uint32_t moveTimeoutMs);
  bool forward(int speed);
  bool forward(int speed, uint32_t moveTimeoutMs);
  bool back(int speed);
  bool back(int speed, uint32_t moveTimeoutMs);
  bool turnLeft(int speed);
  bool turnLeft(int speed, uint32_t moveTimeoutMs);
  bool turnRight(int speed);
  bool turnRight(int speed, uint32_t moveTimeoutMs);

  // Debe llamarse periodicamente. Aplica el deadman y devuelve el evento.
  Event update(uint32_t now);

  bool isArmed() const { return _armed; }
  bool isMoving() const { return _left != 0 || _right != 0; }
  int leftCmd() const { return _left; }
  int rightCmd() const { return _right; }
  uint32_t moveTimeoutMs() const { return _moveTimeoutMs; }

private:
  MotorDriver *_driver = nullptr;
  bool _armed = false;
  uint32_t _lastCmdMs = 0;
  uint32_t _moveTimeoutMs = MANUAL_MOVE_TIMEOUT_MS;
  int _left = 0;
  int _right = 0;

  static int clamp100(int v);
  static int withOffset(int speed, int offset);
};

#endif // CONTROL_MANUAL_H
