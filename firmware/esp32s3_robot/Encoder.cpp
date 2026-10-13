#include "Encoder.h"
#include "Config.h"
#include <math.h>

Encoder *Encoder::_instances[2] = {nullptr, nullptr};

void Encoder::isrThunk0() { if (_instances[0]) _instances[0]->isrPulse(); }
void Encoder::isrThunk1() { if (_instances[1]) _instances[1]->isrPulse(); }

void IRAM_ATTR Encoder::isrPulse() {
  _count += _sign;
}

void Encoder::begin(uint8_t channel) {
  _channel = (channel == 0) ? 0 : 1;
  _instances[_channel] = this;

  int pinA = (_channel == 0) ? ENCODER_L_A : ENCODER_R_A;
  pinMode(pinA, INPUT_PULLUP);

#if ENCODER_USE_QUADRATURE
  int pinB = (_channel == 0) ? ENCODER_L_B : ENCODER_R_B;
  pinMode(pinB, INPUT_PULLUP);
#endif

  attachInterrupt(digitalPinToInterrupt(pinA),
                  (_channel == 0) ? isrThunk0 : isrThunk1,
                  RISING);
}

long Encoder::delta() {
  long d = _count - _last;
  _last = _count;
  return d;
}

void Encoder::update(uint32_t nowMs) {
  if (nowMs - _lastSampleMs < ENCODER_SAMPLE_MS) return;
  uint32_t dt = nowMs - _lastSampleMs;
  _lastSampleMs = nowMs;

  long pulses = _count - _sampleCount;
  _sampleCount = _count;

  if (ENCODER_PPR > 0 && dt > 0) {
    // vueltas = pulsos / PPR ; rpm = vueltas / (dt minutos)
    float revs = (float)pulses / (float)ENCODER_PPR;
    _rpm = revs * 60000.0f / (float)dt;
  } else {
    _rpm = NAN;   // PPR sin definir (H-01)
  }
}
