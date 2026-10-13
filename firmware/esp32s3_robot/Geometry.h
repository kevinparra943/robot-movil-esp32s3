#ifndef GEOMETRY_H
#define GEOMETRY_H

#include <math.h>

// ===========================================================================
// Geometry.h - funciones puras de angulos (sin estado, sin hardware).
// Sirven a la brujula, al control de rumbo y a la navegacion (RF-04/RF-06).
// Estan aisladas para poder verificarlas por separado.
// ===========================================================================
namespace Geometry {

// Lleva un angulo a [0, 360).
inline float wrap360(float deg) {
  float r = fmodf(deg, 360.0f);
  if (r < 0.0f) r += 360.0f;
  return r;
}

// Error angular minimo entre deseado y actual, normalizado a [-180, 180).
// NOTA verificada: la expresion del enunciado NUNCA devuelve +180; el rango
// real es [-180, 180). Ver tests/host/test_heading.py.
inline float angularError(float desired, float actual) {
  return wrap360(desired - actual + 180.0f) - 180.0f;
}

// Diferencia mas corta con signo (+ a la derecha, - a la izquierda).
inline float shortestTurn(float desired, float actual) {
  return angularError(desired, actual);
}

inline float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

} // namespace Geometry

#endif // GEOMETRY_H
