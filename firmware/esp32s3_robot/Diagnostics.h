#ifndef DIAGNOSTICS_H
#define DIAGNOSTICS_H

#include <Arduino.h>

// Diagnostico de arranque: banner, escaner I2C y latido.
// Modulo sin dependencias de estado; solo lectura del bus y de millis().
namespace Diagnostics {

  // Imprime el banner de arranque (nombre y version).
  void printBanner();

  // Recorre el bus I2C e imprime las direcciones que responden.
  // Devuelve el numero de dispositivos encontrados.
  uint8_t scanI2C();

  // Comprueba si una direccion concreta esta presente en el bus.
  bool devicePresent(uint8_t address);

  // Imprime un latido con el tiempo encendido (ms).
  void heartbeat(uint32_t uptimeMs);

} // namespace Diagnostics

#endif // DIAGNOSTICS_H
