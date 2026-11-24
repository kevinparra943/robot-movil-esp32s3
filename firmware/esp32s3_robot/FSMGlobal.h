#ifndef FSM_GLOBAL_H
#define FSM_GLOBAL_H

#include <Arduino.h>
#include "ControlManual.h"

class FSMGlobal {
public:
  enum State : uint8_t {
    BOOT = 0,
    IDLE,
    MANUAL,
    AUTONOMO,
    SAFE,
    ERROR
  };

  void begin(ControlManual *manual);
  bool setManual();
  bool setAutonomo();
  void setIdle();
  void estop();
  void stopMotion();

  void setHeadingTarget(float deg);
  void clearHeadingTarget();

  ControlManual::Event update(uint32_t now);

  State state() const { return _state; }
  const char *modeName() const;
  const char *stateLabel() const;
  bool isManual() const { return _state == MANUAL; }
  bool isAuto() const { return _state == AUTONOMO; }
  bool isEstop() const { return _state == SAFE; }
  bool isArmed() const;
  bool hasHeadingTarget() const { return _headingTargetValid; }
  float headingTarget() const { return _headingTarget; }
  ControlManual::Event lastEvent() const { return _lastEvent; }

private:
  ControlManual *_manual = nullptr;
  State _state = BOOT;
  bool _headingTargetValid = false;
  float _headingTarget = 0.0f;
  ControlManual::Event _lastEvent = ControlManual::EVENT_NONE;
};

#endif
