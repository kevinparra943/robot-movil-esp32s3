#ifndef WIRELESS_H
#define WIRELESS_H

#include <Arduino.h>
#include <WiFi.h>
#include <functional>
#include <WebSocketsServer.h>
#include "Config.h"

class Wireless {
public:
  using TextHandler = std::function<void(uint8_t clientNum, const char *payload)>;
  using ConnectHandler = std::function<void(uint8_t clientNum)>;

  void begin(const char *staSsid, const char *staPass);
  void update();

  void onText(TextHandler handler) { _onText = handler; }
  void onConnect(ConnectHandler handler) { _onConnect = handler; }

  void broadcast(const String &message);
  void sendTo(uint8_t clientNum, const String &message);

  bool hasClients();
  int clientCount();
  bool apActive() const;
  bool staConnected() const;
  String ipAddress() const;
  String staIpAddress() const;
  String remoteIp(uint8_t clientNum);

private:
  static Wireless *_instance;
  static void eventHandler(uint8_t num, WStype_t type, uint8_t *payload, size_t length);

  WebSocketsServer _server{WS_PORT};
  TextHandler _onText;
  ConnectHandler _onConnect;
  bool _started = false;
  bool _staEnabled = false;
  wl_status_t _lastStaStatus = WL_IDLE_STATUS;
};

#endif
