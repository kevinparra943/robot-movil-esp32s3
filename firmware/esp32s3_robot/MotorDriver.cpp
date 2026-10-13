#include "MotorDriver.h"
#include "Config.h"

void MotorDriver::begin() {
  // Pines de direccion
  pinMode(MOTOR_L_IN1, OUTPUT);
  pinMode(MOTOR_L_IN2, OUTPUT);
  pinMode(MOTOR_R_IN1, OUTPUT);
  pinMode(MOTOR_R_IN2, OUTPUT);

  // STBY como salida y en LOW: driver deshabilitado (estado seguro)
  pinMode(MOTOR_STBY, OUTPUT);
  digitalWrite(MOTOR_STBY, LOW);
  _enabled = false;

  // PWM por LEDC (core ESP32 3.x: se adjunta por pin)
  ledcAttach(MOTOR_L_PWM, MOTOR_PWM_FREQ_HZ, MOTOR_PWM_RESOLUTION);
  ledcAttach(MOTOR_R_PWM, MOTOR_PWM_FREQ_HZ, MOTOR_PWM_RESOLUTION);
  ledcWrite(MOTOR_L_PWM, 0);
  ledcWrite(MOTOR_R_PWM, 0);

  // Direcciones en reposo
  digitalWrite(MOTOR_L_IN1, LOW);
  digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW);
  digitalWrite(MOTOR_R_IN2, LOW);

  _left = 0;
  _right = 0;
}

void MotorDriver::enable() {
  digitalWrite(MOTOR_STBY, HIGH);
  _enabled = true;
}

void MotorDriver::disable() {
  digitalWrite(MOTOR_STBY, LOW);
  _enabled = false;
}

int MotorDriver::clamp100(int v) {
  if (v > 100) return 100;
  if (v < -100) return -100;
  return v;
}

int MotorDriver::speedToDuty(int speed) {
  // speed 0..100 -> duty 0..MOTOR_PWM_MAX
  long duty = (long)abs(speed) * MOTOR_PWM_MAX / 100;
  if (duty > MOTOR_PWM_MAX) duty = MOTOR_PWM_MAX;
  return (int)duty;
}

void MotorDriver::apply(int in1, int in2, int pwmPin, int speed) {
  speed = clamp100(speed);
  if (speed > 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
  } else if (speed < 0) {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
  } else {
    digitalWrite(in1, LOW);
    digitalWrite(in2, LOW);
  }
  ledcWrite(pwmPin, speedToDuty(speed));
}

void MotorDriver::setLeft(int speed) {
  if (!_enabled) return;   // garantia de estado seguro
  _left = clamp100(speed);
  apply(MOTOR_L_IN1, MOTOR_L_IN2, MOTOR_L_PWM, _left);
}

void MotorDriver::setRight(int speed) {
  if (!_enabled) return;
  _right = clamp100(speed);
  apply(MOTOR_R_IN1, MOTOR_R_IN2, MOTOR_R_PWM, _right);
}

void MotorDriver::stop() {
  _left = 0;
  _right = 0;
  ledcWrite(MOTOR_L_PWM, 0);
  ledcWrite(MOTOR_R_PWM, 0);
  digitalWrite(MOTOR_L_IN1, LOW);
  digitalWrite(MOTOR_L_IN2, LOW);
  digitalWrite(MOTOR_R_IN1, LOW);
  digitalWrite(MOTOR_R_IN2, LOW);
}

void MotorDriver::safeStop() {
  stop();
  disable();
}
