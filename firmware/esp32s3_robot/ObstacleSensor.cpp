#include "ObstacleSensor.h"
#include "Config.h"

static uint32_t s_lastTriggerUs = 0;

ObstacleSensor::ObstacleSensor(uint8_t trigPin, uint8_t echoPin, uint16_t phaseMs)
    : _trigPin(trigPin), _echoPin(echoPin), _phaseMs(phaseMs) {}

void ObstacleSensor::isrThunk(void *arg) {
  ObstacleSensor *self = static_cast<ObstacleSensor *>(arg);
  if (self) self->isrChange();
}

// ISR: mide la anchura del pulso de ECHO sin bloquear el programa.
void ObstacleSensor::isrChange() {
  uint32_t now = micros();
  if (digitalRead(_echoPin) == HIGH) {
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
  pinMode(_trigPin, OUTPUT);
  digitalWrite(_trigPin, LOW);
  pinMode(_echoPin, INPUT);
  attachInterruptArg(digitalPinToInterrupt(_echoPin), isrThunk, this, CHANGE);
  _nextTriggerUs = micros() + (uint32_t)_phaseMs * 1000UL;
}

void ObstacleSensor::update(uint32_t nowUs) {
  // 1) Si hay un pulso medido por la ISR, convertir a distancia.
  if (_echoDone) {
    _echoDone = false;
    _waiting = false;
    _hasReading = true;
    _nextTriggerUs = _trigSentUs + (uint32_t)SONAR_PERIOD_MS * 1000UL;
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
  if (_waiting && (uint32_t)(nowUs - _trigSentUs) > SONAR_TIMEOUT_US) {
    _waiting = false;
    _hasReading = true;
    _valid = false;
    _distanceCm = NAN;
    _nextTriggerUs = _trigSentUs + (uint32_t)SONAR_PERIOD_MS * 1000UL;
  }

  // 3) Si no esta midiendo, toca y hay separacion respecto al ultimo disparo.
  bool due = (int32_t)(nowUs - _nextTriggerUs) >= 0;
  bool spaced = (int32_t)(nowUs - s_lastTriggerUs) >= (int32_t)SONAR_STAGGER_US;
  if (!_waiting && due && spaced) {
    digitalWrite(_trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(_trigPin, LOW);
    _trigSentUs = micros();
    s_lastTriggerUs = _trigSentUs;
    _nextTriggerUs = _trigSentUs + (uint32_t)SONAR_PERIOD_MS * 1000UL;
    _waiting = true;
  }
}

bool ObstacleSensor::isBlocked() const {
  return _valid && _distanceCm < OBSTACLE_DETECT_CM;
}
