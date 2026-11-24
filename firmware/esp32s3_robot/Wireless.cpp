#include "Wireless.h"

Wireless *Wireless::_instance = nullptr;

void Wireless::begin(const char *staSsid, const char *staPass) {
  _instance = this;
  _staEnabled = staSsid && strlen(staSsid) > 0;

  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);

  bool apOk = WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASS, 6, 0, 4);
  if (apOk) {
    Serial.print(F("[WIFI] AP '"));
    Serial.print(F(WIFI_AP_SSID));
    Serial.print(F("' listo en "));
    Serial.print(WiFi.softAPIP());
    Serial.print(F(" canal "));
    Serial.println(WiFi.channel());
  } else {
    Serial.println(F("[WIFI] ERROR: no se pudo crear el AP"));
  }

  if (_staEnabled) {
    WiFi.begin(staSsid, staPass);
    Serial.print(F("[WIFI] STA conectando a '"));
    Serial.print(staSsid);
    Serial.println(F("'..."));
  } else {
    Serial.println(F("[WIFI] STA sin credenciales; solo AP."));
  }

  _server.onEvent(eventHandler);
  _server.begin();
  _server.enableHeartbeat(15000, 3000, 2);

  Serial.print(F("[WS] Servidor WebSocket en ws://"));
  Serial.print(ipAddress());
  Serial.print(':');
  Serial.println(WS_PORT);

  _started = true;
}

void Wireless::update() {
  if (!_started) return;
  _server.loop();

  if (_staEnabled) {
    wl_status_t st = WiFi.status();
    if (st != _lastStaStatus) {
      _lastStaStatus = st;
      if (st == WL_CONNECTED) {
        Serial.print(F("[WIFI] STA conectado. IP="));
        Serial.print(WiFi.localIP());
        Serial.print(F(" RSSI="));
        Serial.print(WiFi.RSSI());
        Serial.println(F(" dBm"));
      } else if (st == WL_CONNECT_FAILED) {
        Serial.println(F("[WIFI] STA: fallo de conexion; se mantiene el AP."));
      }
    }
  }
}

void Wireless::broadcast(const String &message) {
  if (!_started) return;
  if (_server.connectedClients() <= 0) return;
  _server.broadcastTXT(message.c_str(), message.length());
}

void Wireless::sendTo(uint8_t clientNum, const String &message) {
  if (!_started) return;
  if (!_server.clientIsConnected(clientNum)) return;
  _server.sendTXT(clientNum, message.c_str(), message.length());
}

bool Wireless::hasClients() {
  return _started && _server.connectedClients() > 0;
}

int Wireless::clientCount() {
  return _started ? _server.connectedClients() : 0;
}

bool Wireless::apActive() const {
  return (WiFi.getMode() & WIFI_AP) && WiFi.softAPIP()[0] != 0;
}

bool Wireless::staConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

String Wireless::ipAddress() const {
  if (apActive()) return WiFi.softAPIP().toString();
  return WiFi.localIP().toString();
}

String Wireless::staIpAddress() const {
  return WiFi.localIP().toString();
}

String Wireless::remoteIp(uint8_t clientNum) {
  return _server.remoteIP(clientNum).toString();
}

void Wireless::eventHandler(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  Wireless *self = _instance;
  if (!self) return;

  switch (type) {
    case WStype_CONNECTED:
      Serial.print(F("[WS] Cliente #"));
      Serial.print(num);
      Serial.print(F(" conectado desde "));
      Serial.println(self->remoteIp(num));
      if (self->_onConnect) self->_onConnect(num);
      break;

    case WStype_DISCONNECTED:
      Serial.print(F("[WS] Cliente #"));
      Serial.print(num);
      Serial.println(F(" desconectado"));
      break;

    case WStype_TEXT: {
      String msg((const char *)payload, length);
      if (self->_onText) self->_onText(num, msg.c_str());
      break;
    }

    default:
      break;
  }
}
