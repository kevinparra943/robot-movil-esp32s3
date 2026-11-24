#ifndef OBSTACLE_SENSOR_H
#define OBSTACLE_SENSOR_H

#include <Arduino.h>

// ===========================================================================
// ObstacleSensor - HC-SR04 por GPIO, RF-06.
// Cada instancia tiene sus propios pines e interrupcion. La medicion es NO
// bloqueante: el pulso de ECHO se cronometra en la ISR y la distancia se
// calcula fuera de ella. El disparo se escalona entre instancias.
// ===========================================================================
class ObstacleSensor {
public:
  ObstacleSensor(uint8_t trigPin, uint8_t echoPin, uint16_t phaseMs = 0);

  // Configura pines e interrupcion.
  void begin();

  // Avanza la maquina de medicion (dispara y comprueba timeout).
  void update(uint32_t nowUs);

  bool hasReading() const { return _hasReading; }
  bool isValid() const { return _valid; }
  float distanceCm() const { return _distanceCm; }

  // Bloqueado si hay lectura valida por debajo del umbral de deteccion.
  bool isBlocked() const;

private:
  const uint8_t _trigPin;
  const uint8_t _echoPin;
  const uint16_t _phaseMs;

  volatile uint32_t _echoStartUs = 0;
  volatile uint32_t _echoEndUs = 0;
  volatile uint32_t _pulseUs = 0;
  volatile bool _echoDone = false;
  volatile bool _echoActive = false;

  uint32_t _trigSentUs = 0;
  uint32_t _nextTriggerUs = 0;
  bool _waiting = false;
  bool _hasReading = false;
  bool _valid = false;
  float _distanceCm = NAN;

  void IRAM_ATTR isrChange();

  // Puente estatico: recibe la instancia como argumento de attachInterruptArg.
  static void IRAM_ATTR isrThunk(void *arg);
};

#endif // OBSTACLE_SENSOR_H
