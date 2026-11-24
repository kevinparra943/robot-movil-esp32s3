#include "Navigator.h"
#include "Config.h"
#include <math.h>

// Convencion de ruedas (ControlManual): turnRight = (+v, -v), turnLeft = (-v, +v).
// Error angular positivo => el rumbo deseado esta a la derecha => girar a la derecha.

float Navigator::angleError(float target, float actual) {
  float e = fmodf(target - actual + 540.0f, 360.0f);
  if (e < 0.0f) e += 360.0f;
  return e - 180.0f;
}

int Navigator::clampInt(int v, int lo, int hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

const char *Navigator::strategyName() const {
  switch (_strategy) {
    case RUMBO: return "rumbo";
    case LINEA: return "linea";
    default:    return "evadir";
  }
}

void Navigator::reset(uint32_t nowMs, Strategy strategy) {
  _strategy = strategy;
  _evadeDir = 0;
  _sideClearSinceMs = 0;
  _headingMode = false;
  _lineSide = -1;
  _whiteSinceMs = 0;
  enter(NAVEGAR, nowMs);
}

void Navigator::enterSearch(int8_t firstDir, uint32_t nowMs) {
  enter(BUSCAR_LINEA, nowMs);
  _sweepDir = firstDir >= 0 ? 1 : -1;
  _sweepStep = 1;
  _sweepSinceMs = nowMs;
}

NavOutput Navigator::arc(int8_t dir, int speed) {
  const int outer = speed;
  const int inner = (int)lroundf(speed * LINE_ARC_INNER_RATIO);
  return (dir > 0) ? NavOutput{ outer, inner } : NavOutput{ inner, outer };
}

// Barrido de búsqueda: pivota SIEMPRE sobre la rueda izquierda (quieta) y mueve
// la derecha atrás (gira a la derecha) o adelante (gira a la izquierda). El
// sensor barre un arco sin que el robot se desplace, a la mitad de velocidad
// angular que girando en el sitio. La derecha no lleva offset de balance.
NavOutput Navigator::spin(int8_t dir, int speed) {
  return (dir > 0) ? NavOutput{ 0, -speed } : NavOutput{ 0, speed };
}

void Navigator::enter(State s, uint32_t nowMs) {
  _state = s;
  _stateSinceMs = nowMs;
  _sideClearSinceMs = 0;
}

const char *Navigator::stateName() const {
  switch (_state) {
    case NAVEGAR:      return "NAVEGAR";
    case BUSCAR_LINEA: return "BUSCAR_LINEA";
    case EVADIR:       return "EVADIR";
    case BORDEAR:      return "BORDEAR";
    case REORIENTAR:   return "REORIENTAR";
    case RETROCEDER:   return "RETROCEDER";
    case VOLVER:       return "VOLVER";
    case ALINEAR:      return "ALINEAR";
    default:           return "?";
  }
}

int8_t Navigator::chooseEvadeDir(const NavInput &in) const {
  if (in.leftBlocked && !in.rightBlocked) return +1;   // izquierda ocupada -> derecha
  if (in.rightBlocked && !in.leftBlocked) return -1;   // derecha ocupada -> izquierda
  if (in.leftValid && in.rightValid) {
    return (in.leftCm > in.rightCm) ? -1 : +1;          // al lado con mas espacio
  }
  if (in.leftValid && !in.rightValid) return +1;        // sin eco a la derecha = libre
  if (in.rightValid && !in.leftValid) return -1;
  // Sin informacion lateral: hacia el rumbo deseado si existe.
  if (_headingMode) {
    return angleError(in.target, in.heading) >= 0.0f ? +1 : -1;
  }
  return +1;
}

NavOutput Navigator::step(const NavInput &in, uint32_t nowMs) {
  const int v = AUTO_DRIVE_SPEED;
  const int w = AUTO_TURN_SPEED;
  _headingMode = _strategy == RUMBO && in.targetValid && in.headingValid;

  // --- Reglas de seguridad comunes a todos los estados ---------------------
  if (_state != RETROCEDER && in.frontBlocked && in.leftBlocked && in.rightBlocked) {
    enter(RETROCEDER, nowMs);
  } else if (in.frontBlocked && (_state == NAVEGAR || _state == BUSCAR_LINEA ||
                                 _state == BORDEAR || _state == REORIENTAR ||
                                 _state == VOLVER || _state == ALINEAR)) {
    // Rodeando (BORDEAR/VOLVER) se mantiene el lado: la linea sigue donde estaba.
    if ((_state != BORDEAR && _state != VOLVER) || _evadeDir == 0) {
      _evadeDir = chooseEvadeDir(in);
    }
    enter(EVADIR, nowMs);
  }
  const uint32_t inState = nowMs - _stateSinceMs;

  switch (_state) {
    case RETROCEDER:
      if (inState >= NAV_BACK_MS) {
        _evadeDir = chooseEvadeDir(in);
        enter(EVADIR, nowMs);
        return step(in, nowMs);
      }
      return { -v, -v };

    case EVADIR:
      // Gira en sitio hasta que el frente queda libre (o hasta un maximo).
      // y un poco más (NAV_EVADE_EXTRA_MS) para no rozar la esquina.
      if (in.frontBlocked) {
        _sideClearSinceMs = 0;
      } else {
        if (_sideClearSinceMs == 0) _sideClearSinceMs = nowMs ? nowMs : 1;
        if (nowMs - _sideClearSinceMs >= NAV_EVADE_EXTRA_MS) {
          enter(BORDEAR, nowMs);
          return { v, v };
        }
      }
      if (inState >= NAV_EVADE_MAX_MS) {
        enter(RETROCEDER, nowMs);
        return { -v, -v };
      }
      return (_evadeDir > 0) ? NavOutput{ w, -w } : NavOutput{ -w, w };

    case BORDEAR: {
      // Avanza recto mientras el lateral del lado del obstaculo lo vea, y un
      // margen NAV_BYPASS_MS mas tras perderlo, para no rozarlo al volver.
      const bool sideSees = (_evadeDir > 0) ? in.leftBlocked : in.rightBlocked;
      if (sideSees) {
        _sideClearSinceMs = 0;
      } else if (_sideClearSinceMs == 0) {
        _sideClearSinceMs = nowMs ? nowMs : 1;
      }
      const uint32_t bypassMs = (_strategy == LINEA) ? NAV_LINE_BYPASS_MS : NAV_BYPASS_MS;
      const bool passed = _sideClearSinceMs != 0 &&
                          (nowMs - _sideClearSinceMs) >= bypassMs;
      if (passed || inState >= NAV_BORDEAR_MAX_MS) {
        if (_headingMode) {
          enter(REORIENTAR, nowMs);
        } else if (_strategy == LINEA) {
          enter(VOLVER, nowMs);
        } else {
          _evadeDir = 0;
          enter(NAVEGAR, nowMs);
        }
        return step(in, nowMs);
      }
      return { v, v };
    }

    case REORIENTAR: {
      // Brújula perdida a mitad de giro: seguir avanzando y esquivando.
      if (!_headingMode) { _evadeDir = 0; enter(NAVEGAR, nowMs); return step(in, nowMs); }
      const float e = angleError(in.target, in.heading);
      if (fabsf(e) <= NAV_REALIGN_OK_DEG) {
        _evadeDir = 0;
        enter(NAVEGAR, nowMs);
        return step(in, nowMs);
      }
      // Si el lado hacia el que hay que girar esta ocupado, seguir bordeando.
      const bool toRight = e > 0.0f;
      if ((toRight && in.rightBlocked) || (!toRight && in.leftBlocked)) {
        return { v, v };
      }
      return toRight ? NavOutput{ w, -w } : NavOutput{ -w, w };
    }

    case VOLVER: {
      // Tras esquivar a la derecha la línea quedó a la izquierda (y viceversa).
      const int8_t side = _evadeDir > 0 ? -1 : 1;
      if (in.onColor) {
        _lineSide = side;
        _evadeDir = 0;
        _alignSawWhite = false;
        enter(ALINEAR, nowMs);
        return step(in, nowMs);
      }
      if (inState >= NAV_RETURN_MAX_MS) {
        enterSearch(side, nowMs);
        return step(in, nowMs);
      }
      // El obstáculo aún ocupa ese lado: seguir recto hasta rebasarlo.
      const bool near = (side < 0) ? (in.leftValid && in.leftCm < OBSTACLE_STOP_CM)
                                   : (in.rightValid && in.rightCm < OBSTACLE_STOP_CM);
      if (near) return { v, v };
      const int inner = (inState % NAV_RETURN_PERIOD_MS < NAV_RETURN_PIVOT_MS) ? 0 : NAV_RETURN_SPEED;
      return (side < 0) ? NavOutput{ inner, NAV_RETURN_SPEED }
                        : NavOutput{ NAV_RETURN_SPEED, inner };
    }

    case ALINEAR:
      // Puede llegar casi perpendicular y cruzar la cinta: pivota alejándose del
      // obstáculo hasta volver a verla (ya en el sentido de marcha) o un máximo.
      if (!in.onColor) _alignSawWhite = true;
      if ((_alignSawWhite && in.onColor) || inState >= NAV_LINE_ALIGN_MS) {
        _whiteSinceMs = 0;
        enter(NAVEGAR, nowMs);
        return step(in, nowMs);
      }
      return arc(-_lineSide, NAV_RETURN_SPEED);

    case BUSCAR_LINEA:
      if (in.onColor) {
        // Encontrada girando hacia _sweepDir: la línea está de ese lado.
        // Sin frenar (los motores TT cuestan arrancar): sigue el borde ya.
        _lineSide = _sweepDir;
        _evadeDir = 0;
        _whiteSinceMs = 0;
        enter(NAVEGAR, nowMs);
        return step(in, nowMs);
      }
      // Vaivén: barrido n dura LINE_SWEEP_MS * n, alternando el sentido, así
      // la amplitud crece (1, -1, +2, -2...) sin dar vueltas completas.
      if (nowMs - _sweepSinceMs >= (uint32_t)LINE_SWEEP_MS * _sweepStep) {
        _sweepDir = -_sweepDir;
        _sweepStep = (_sweepStep >= LINE_SWEEP_STEPS) ? 1 : _sweepStep + 1;
        _sweepSinceMs = nowMs;
      }
      return spin(_sweepDir, LINE_SEARCH_SPEED);

    case NAVEGAR:
    default:
      if (_headingMode) {
        const float e = angleError(in.target, in.heading);
        if (fabsf(e) > NAV_ALIGN_DEG) {
          // Muy desalineado: girar en sitio.
          return (e > 0.0f) ? NavOutput{ w, -w } : NavOutput{ -w, w };
        }
        // Control proporcional sobre el error angular.
        const int corr = clampInt((int)lroundf(NAV_KP * e), -NAV_MAX_CORR, NAV_MAX_CORR);
        return { clampInt(v + corr, -100, 100), clampInt(v - corr, -100, 100) };
      }
      // Solo evasión (o RUMBO sin brújula válida): recto.
      if (_strategy != LINEA) return { v, v };
      // Modo línea: seguir el borde pivotando.
      if (in.onColor) {
        _whiteSinceMs = 0;
        return arc(-_lineSide, LINE_FOLLOW_SPEED);   // sobre la línea: alejarse (rápido)
      }
      if (_whiteSinceMs == 0) _whiteSinceMs = nowMs ? nowMs : 1;
      if (nowMs - _whiteSinceMs >= LINE_LOST_MS) {
        enterSearch(_lineSide, nowMs);     // blanco demasiado tiempo: buscar
        return step(in, nowMs);
      }
      return arc(_lineSide, LINE_RETURN_SPEED);    // blanco breve: volver (más lento)
  }
}
