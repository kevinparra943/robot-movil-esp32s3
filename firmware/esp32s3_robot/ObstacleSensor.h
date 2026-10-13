#ifndef OBSTACLE_SENSOR_H
#define OBSTACLE_SENSOR_H

#include <Arduino.h>

// ===========================================================================
// ObstacleSensor - HC-SR04 por GPIO, RF-06.
// Medicion NO bloqueante: el pulso de ECHO se cronometra por interrupcion y
// la distancia se calcula fuera de la ISR. Incluye timeout de "sin eco".
// ===========================================================================
class ObstacleSensor {
public:
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

  void isrChange();

  // Puente para poder llamar al metodo desde una interrupcion estatica.
  static ObstacleSensor *_instance;
  static void isrThunk();
};

#endif // OBSTACLE_SENSOR_H
