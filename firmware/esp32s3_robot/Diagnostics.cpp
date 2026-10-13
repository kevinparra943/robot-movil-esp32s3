#include "Diagnostics.h"
#include "Config.h"
#include <Wire.h>

namespace Diagnostics {

void printBanner() {
  Serial.println();
  Serial.println(F("====================================================="));
  Serial.print(F("  "));
  Serial.print(F(FIRMWARE_NAME));
  Serial.print(F("  v"));
  Serial.println(F(FIRMWARE_VERSION));
  Serial.println(F("  T-00: bring-up seguro (motores DETENIDOS)"));
  Serial.println(F("====================================================="));
}

bool devicePresent(uint8_t address) {
  Wire.beginTransmission(address);
  return (Wire.endTransmission() == 0);
}

uint8_t scanI2C() {
  Serial.println(F("[I2C] Barriendo el bus..."));
  uint8_t found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    if (devicePresent(addr)) {
      found++;
      Serial.print(F("  -> Dispositivo en 0x"));
      if (addr < 16) Serial.print('0');
      Serial.print(addr, HEX);
      if (addr == ADDR_QMC5883L) Serial.print(F("  (brujula QMC5883L)"));
      if (addr == ADDR_TCS34725) Serial.print(F("  (color TCS34725)"));
      Serial.println();
    }
  }
  if (found == 0) {
    Serial.println(F("  (ningun dispositivo; revisa cableado y pull-ups)"));
  }

  Serial.println(F("[I2C] Comprobacion de sensores esperados:"));
  Serial.print(F("  QMC5883L (0x"));
  Serial.print(ADDR_QMC5883L, HEX);
  Serial.print(F("): "));
  Serial.println(devicePresent(ADDR_QMC5883L) ? F("OK") : F("NO RESPONDE"));

  Serial.print(F("  TCS34725 (0x"));
  Serial.print(ADDR_TCS34725, HEX);
  Serial.print(F("): "));
  Serial.println(devicePresent(ADDR_TCS34725) ? F("OK") : F("NO RESPONDE"));

  return found;
}

void heartbeat(uint32_t uptimeMs) {
  Serial.print(F("[HB] t="));
  Serial.print(uptimeMs);
  Serial.println(F(" ms  estado=DETENIDO"));
}

} // namespace Diagnostics
