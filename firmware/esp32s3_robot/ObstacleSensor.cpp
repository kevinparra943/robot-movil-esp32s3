#include "ObstacleSensor.h"
#include "Config.h"

ObstacleSensor *ObstacleSensor::_instance = nullptr;

void ObstacleSensor::isrThunk() {
  if (_instance) _instance->isrChange();
}

// ISR: mide la anchura del pulso de ECHO sin bloquear el programa.
void IRAM_ATTR ObstacleSensor::isrChange() {
  uint32_t now = micros();
  if (digitalRead(SONAR_ECHO_PIN) == HIGH) {
    _echoStartUs = now;
    _echoActive = true;
  } else if (_echoActive) {
    _echoEndUs = now;
    _pulseUs = _echoEndUs - _echoStartUs;
    _echoActive = false;
    _echoDone = true;
  }
}

void ObstacleSensor::begin() {
  _instance = this;
  pinMode(SONAR_TRIG_PIN, OUTPUT);
  digitalWrite(SONAR_TRIG_PIN, LOW);
  pinMode(SONAR_ECHO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(SONAR_ECHO_PIN), isrThunk, CHANGE);
}

void ObstacleSensor::update(uint32_t nowUs) {
  // 1) Si hay un pulso medido por la ISR, convertir a distancia.
  if (_echoDone) {
    _echoDone = false;
    _waiting = false;
    _hasReading = true;
    _nextTriggerUs = nowUs + (uint32_t)SONAR_PERIOD_MS * 1000UL;
    // Distancia = tiempo * (cm/us) / 2  (ida y vuelta)
    float cm = (float)_pulseUs * SOUND_CM_PER_US * 0.5f;
    if (cm >= SONAR_MIN_CM && cm <= SONAR_MAX_CM) {
      _distanceCm = cm;
      _valid = true;
    } else {
      _valid = false;
      _distanceCm = NAN;
    }
  }

  // 2) Timeout: se disparo pero no llego eco (fuera de rango / sin obstaculo).
  if (_waiting && (nowUs - _trigSentUs) > SONAR_TIMEOUT_US) {
    _waiting = false;
    _hasReading = true;
    _valid = false;
    _distanceCm = NAN;
    _nextTriggerUs = nowUs + (uint32_t)SONAR_PERIOD_MS * 1000UL;
  }

  // 3) Si no esta midiendo y toca, dispara una nueva medicion.
  if (!_waiting && nowUs >= _nextTriggerUs) {
    digitalWrite(SONAR_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(SONAR_TRIG_PIN, LOW);
    _trigSentUs = micros();
    _waiting = true;
  }
}

bool ObstacleSensor::isBlocked() const {
  return _valid && _distanceCm < OBSTACLE_DETECT_CM;
}
