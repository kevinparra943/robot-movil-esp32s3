#ifndef NAVIGATOR_H
#define NAVIGATOR_H

#include <stdint.h>

// ===========================================================================
// Navigator - piloto del modo AUTONOMO (RF-04 + RF-05 + RF-06).
//
// Logica pura: recibe las lecturas (rumbo, obstaculos, color) y devuelve la
// consigna de ruedas. No toca hardware ni usa delay(); el .ino aplica la
// consigna con ControlManual::setWheels(). La misma logica esta replicada en
// tests/host/test_navigator.py para probarla sin placa.
//
// Tres submodos (los elige el usuario al entrar en AUTONOMO):
//   - EVADIR_SOLO: avanza recto y esquiva obstaculos. Ignora rumbo y linea.
//   - RUMBO: control P sobre el error angular; ante un obstaculo lo bordea y
//     vuelve al rumbo (REORIENTAR). Si la brujula deja de ser valida, sigue
//     avanzando y esquivando hasta recuperarla (NO pasa a seguir linea).
//   - LINEA: sigue el borde de la linea (cualquier color menos blanco); ante
//     un obstaculo lo rodea y vuelve a ella en arco (VOLVER). Ignora el rumbo.
// ===========================================================================

struct NavInput {
  bool  headingValid;   // brujula con lectura valida
  float heading;        // rumbo actual [0,360)
  bool  targetValid;    // hay rumbo deseado
  float target;         // rumbo deseado [0,360)
  bool  frontBlocked;
  bool  leftBlocked;
  bool  rightBlocked;
  bool  leftValid;
  bool  rightValid;
  float leftCm;
  float rightCm;
  bool  onColor;        // color calibrado distinto de blanco/desconocido
};

struct NavOutput {
  int left;   // -100..100
  int right;  // -100..100
};

class Navigator {
public:
  enum Strategy : uint8_t { EVADIR_SOLO = 0, RUMBO, LINEA };

  enum State : uint8_t {
    NAVEGAR = 0,     // rumbo: control P / linea: avanzar sobre color
    BUSCAR_LINEA,    // linea perdida: girar para reencontrarla
    EVADIR,          // obstaculo frontal: girar en sitio hasta despejar
    BORDEAR,         // avanzar junto al obstaculo hasta superarlo
    REORIENTAR,      // volver al rumbo deseado tras la evasion
    RETROCEDER,      // encerrado por los tres sensores
    VOLVER,          // linea: arco de regreso tras rodear un obstaculo
    ALINEAR          // linea reencontrada: pivotar para retomar el sentido
  };

  void reset(uint32_t nowMs, Strategy strategy);
  Strategy strategy() const { return _strategy; }
  const char *strategyName() const;   // "evadir" | "rumbo" | "linea"
  NavOutput step(const NavInput &in, uint32_t nowMs);

  State state() const { return _state; }
  const char *stateName() const;
  bool headingMode() const { return _headingMode; }

  // Error angular minimo deseado-actual en [-180, 180). Positivo = girar a la derecha.
  static float angleError(float target, float actual);

private:
  Strategy _strategy = EVADIR_SOLO;
  State    _state = NAVEGAR;
  int8_t   _evadeDir = 0;      // +1 esquiva a la derecha, -1 a la izquierda
  uint32_t _stateSinceMs = 0;
  uint32_t _sideClearSinceMs = 0;
  bool     _headingMode = false;

  // Seguimiento de línea (modo sin rumbo)
  int8_t   _lineSide = -1;     // lado donde quedó la línea: +1 derecha, -1 izquierda
  uint32_t _whiteSinceMs = 0;  // 0 = sobre color
  bool     _alignSawWhite = false;
  int8_t   _sweepDir = -1;     // sentido del barrido de búsqueda actual
  uint8_t  _sweepStep = 1;     // barrido n: dura LINE_SWEEP_MS * n
  uint32_t _sweepSinceMs = 0;

  void enter(State s, uint32_t nowMs);
  void enterSearch(int8_t firstDir, uint32_t nowMs);
  static NavOutput arc(int8_t dir, int speed);   // pivota hacia dir (+1 der., -1 izq.)
  static NavOutput spin(int8_t dir, int speed);  // barrido pivotando sobre la rueda izq.
  int8_t chooseEvadeDir(const NavInput &in) const;
  static int clampInt(int v, int lo, int hi);
};

#endif // NAVIGATOR_H
