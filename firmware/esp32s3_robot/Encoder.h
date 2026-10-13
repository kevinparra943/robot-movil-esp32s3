#ifndef ENCODER_H
#define ENCODER_H

#include <Arduino.h>
#include "Config.h"

// ===========================================================================
// Encoder - lectura de pulsos del motor TT, RF-01/RF-06 (odometria basica).
//
// El motor TT tiene UNA salida de encoder (eje D): se cuentan pulsos por
// interrupcion. No hay cuadratura; el signo se toma del sentido comandado.
// ENCODER_PPR esta pendiente (H-01): sin el, la velocidad no se calcula.
// ===========================================================================
class Encoder {
public:
  // channel: 0 = izquierdo, 1 = derecho. Configura pin A (y B si cuadratura).
  void begin(uint8_t channel);

  // Numero acumulado de pulsos (con signo si se fija la direccion).
  long count() const { return _count; }

  // Pulsos desde la ultima llamada (y reinicia el delta).
  long delta();

  void reset() { _count = 0; _last = 0; }

  // Informa el signo del movimiento (segun lo comandado): +1 o -1.
  void setDirection(int8_t sign) { _sign = (sign < 0) ? -1 : 1; }

  // Actualiza la estimacion de velocidad a partir de las muestras.
  void update(uint32_t nowMs);

  // Revoluciones por minuto estimadas, o NAN si no hay PPR definido.
  float rpm() const { return _rpm; }

  bool pprConfigured() const { return ENCODER_PPR > 0; }

private:
  volatile long _count = 0;
  long _last = 0;
  int8_t _sign = 1;
  uint8_t _channel = 0;
  uint32_t _lastSampleMs = 0;
  long _sampleCount = 0;
  float _rpm = NAN;

  void isrPulse();

  static Encoder *_instances[2];
  static void isrThunk0();
  static void isrThunk1();
};

#endif // ENCODER_H
