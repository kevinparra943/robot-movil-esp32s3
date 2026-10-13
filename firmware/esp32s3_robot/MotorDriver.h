#ifndef MOTOR_DRIVER_H
#define MOTOR_DRIVER_H

#include <Arduino.h>

// Control del puente H TB6612FNG.
// IMPORTANTE (seguridad): begin() deja el driver en STANDBY y los motores
// detenidos. Hay que habilitar() de forma explicita para que se muevan.
class MotorDriver {
public:
  // Configura pines y PWM. Deja STBY en LOW (motores detenidos).
  void begin();

  // Entrada/salida de STANDBY. enable() permite movimiento; disable() lo corta.
  void enable();
  void disable();
  bool isEnabled() const { return _enabled; }

  // speed en rango -100..100 (negativo = marcha atras). No hace nada si esta
  // deshabilitado: es la garantia de estado seguro.
  void setLeft(int speed);
  void setRight(int speed);

  // Detiene ambos motores (duty 0) sin tocar STBY.
  void stop();

  // Detiene ambos motores y baja STBY (estado seguro total).
  void safeStop();

private:
  bool _enabled = false;
  int  _left = 0;
  int  _right = 0;

  void apply(int in1, int in2, int pwmPin, int speed);
  static int clamp100(int v);
  static int speedToDuty(int speed);
};

#endif // MOTOR_DRIVER_H
