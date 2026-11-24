#ifndef CONFIG_H
#define CONFIG_H

// ===========================================================================
// Config.h - Unica fuente de verdad del firmware (pines, versiones, constantes)
// Robot movil inteligente ESP32-S3
// Cualquier cambio de hardware se hace SOLO aqui.
// ===========================================================================

// --- Identificacion -------------------------------------------------------
#define FIRMWARE_NAME            "robot-movil-esp32s3"
#define FIRMWARE_VERSION         "0.4.0-nav" // Fase 6: WiFi/WebSocket + navegacion por rumbo
#define PROTOCOL_VERSION         1

// --- Comunicacion serie ---------------------------------------------------
#define SERIAL_BAUD              115200

// --- WiFi + WebSocket -----------------------------------------------------
// La placa levanta siempre un AP para que la app pueda conectarse sin depender
// de un router. Cambia la contrasena antes de usar el robot fuera del banco.
#define WIFI_AP_SSID             "robot-esp32s3"
#define WIFI_AP_PASS             "robot1234"
// STA opcional: deja vacio para usar solo el AP. No subas credenciales reales.
#define WIFI_STA_SSID            ""
#define WIFI_STA_PASS            ""
#define WS_PORT                  81
#define TELEMETRY_PERIOD_MS      200

// --- Bus I2C (brujula QMC5883L + color TCS34725) --------------------------
#define I2C_SDA_PIN              8
#define I2C_SCL_PIN              9
#define I2C_FREQUENCY_HZ         100000       // 100 kHz: mas robusto que 400 kHz

// Direcciones I2C esperadas (para el diagnostico)
#define ADDR_QMC5883L            0x0D
#define ADDR_TCS34725            0x29

// --- Driver de motores TB6612FNG ------------------------------------------
// Motor izquierdo
#define MOTOR_L_IN1              4
#define MOTOR_L_IN2              5
#define MOTOR_L_PWM              6
// Motor derecho
#define MOTOR_R_IN1              7
#define MOTOR_R_IN2              15
#define MOTOR_R_PWM              16
// Standby del TB6612 (LOW = driver deshabilitado = estado seguro)
#define MOTOR_STBY               18

#define MOTOR_PWM_FREQ_HZ        20000        // 20 kHz: por encima del audible
#define MOTOR_PWM_RESOLUTION     8            // 8 bits -> duty 0..255
#define MOTOR_PWM_MAX            255

// Inversion de sentido por cableado. 1 = invierte el sentido fisico de ese
// motor. Lo recomendable es corregir el cableado (AO1/AO2 o BO1/BO2); se deja
// aqui porque el motor derecho quedo invertido en el montaje actual.
#define MOTOR_L_INVERT           1
#define MOTOR_R_INVERT           0

// --- Sensores de obstaculos HC-SR04 (frontal + laterales) -----------------
// Note: Front and Right were swapped in hardware. Corrected here:
#define SONAR_FRONT_TRIG_PIN     40   // Was: 10 (now correct for front)
#define SONAR_FRONT_ECHO_PIN     41   // Was: 11 (now correct for front)
#define SONAR_LEFT_TRIG_PIN      38
#define SONAR_LEFT_ECHO_PIN      39           // requiere divisor 5V->3.3V
#define SONAR_RIGHT_TRIG_PIN     10   // Was: 40 (now correct for right)
#define SONAR_RIGHT_ECHO_PIN     11   // Was: 41 (now correct for right)

// --- Encoders (cuadratura) ------------------------------------------------
#define ENCODER_L_A              12
#define ENCODER_L_B              13
#define ENCODER_R_A              14
#define ENCODER_R_B              21
#define ENCODER_PPR              0            // [POR DEFINIR] pulsos/vuelta; medir en placa

// --- Boton de parada de emergencia ----------------------------------------
#define ESTOP_BUTTON_PIN         47           // PROPUESTO: a GND, pull-up interno

// --- Parametros de navegacion (PROPUESTOS, calibrar en placa) -------------
#define OBSTACLE_STOP_CM         15.0f
#define OBSTACLE_DETECT_CM       25.0f
#define OBSTACLE_APPROACH_STOP_CM 10.0f       // parada por comando "hasta obstaculo frontal"
#define OBSTACLE_APPROACH_STOP_MIN_CM 5.0f
#define OBSTACLE_APPROACH_STOP_MAX_CM 30.0f
#define OBSTACLE_APPROACH_MAX_MS 8000
#define DRIVE_UNTIL_SENSOR_LOST_MS 300     // avance "hasta obstaculo": parar si el frontal pierde la lectura
#define MANEUVER_MS              700
#define COMMAND_TTL_MS           500          // deadman: caducidad de comando

// --- Control manual por serie (banco y firmware principal) ----------------
// --- Corrección de desbalance de motores ---
// Si el robot se inclina a un lado, ajusta estos valores:
// MOTOR_LEFT_SPEED_OFFSET: positivo = izquierda más rápida (corrige a la derecha)
// MOTOR_RIGHT_SPEED_OFFSET: positivo = derecha más rápida (corrige a la izquierda)
// Rango: -100 a +100 (porcentaje sobre el default)
#define MANUAL_DEFAULT_SPEED     40           // % por defecto para FWD/BACK/LEFT/RIGHT
#define MOTOR_LEFT_SPEED_OFFSET  -8            // offset izquierdo (-100 a +100)
#define MOTOR_RIGHT_SPEED_OFFSET 0            // offset derecho (-100 a +100)
#define MANUAL_MOVE_TIMEOUT_MS   10000        // deadman mientras hay movimiento (aumentado de 3s a 10s para testing)
#define MANUAL_ARM_TIMEOUT_MS    30000        // desarma si se queda armado sin usar (aumentado de 10s a 30s para testing)

// --- Modo autónomo: línea de color + evasión de obstáculos -----------------
#define AUTO_DECISION_MS         50           // ms entre decisiones del piloto autónomo
#define AUTO_DRIVE_SPEED         45           // % de avance siguiendo la línea
#define AUTO_TURN_SPEED          45           // % de giro (evasión / búsqueda de línea)
#define AUTO_CMD_TTL_MS          200          // ms de validez de cada consigna del autónomo

// --- Navegación por rumbo (brújula) en modo autónomo (Navigator) ----------
#define NAV_KP                   0.8f         // % de corrección por grado de error
#define NAV_MAX_CORR             30           // % máximo de corrección diferencial
#define NAV_ALIGN_DEG            45.0f        // |error| mayor: girar en sitio
#define NAV_REALIGN_OK_DEG       10.0f        // |error| menor: rumbo recuperado
#define NAV_BYPASS_MS            600          // avance extra tras dejar atrás el obstáculo
#define NAV_BORDEAR_MAX_MS       3000         // máximo bordeando antes de reorientar
#define NAV_EVADE_MAX_MS         4000         // máximo girando sin despejar -> retroceder
#define NAV_EVADE_EXTRA_MS       150          // sigue girando tras despejar el frente (no rozar la esquina)
#define NAV_BACK_MS              400          // retroceso cuando está encerrado

// Submodo LINEA: regreso a la línea tras rodear un obstáculo (estado VOLVER).
// Arco por pulsos hacia el lado donde quedó la línea: avanza recto y, al inicio
// de cada periodo, pivota NAV_RETURN_PIVOT_MS con la rueda interior quieta. A
// 45 % el sensor (una lectura cada ~120 ms) no se salta una cinta de 2 cm y
// ninguna rueda trabaja dentro de la zona muerta.
#define NAV_RETURN_SPEED         45           // % de las ruedas al volver a la línea
#define NAV_RETURN_PERIOD_MS     300          // periodo del arco por pulsos
#define NAV_RETURN_PIVOT_MS      100          // parte del periodo pivotando
#define NAV_LINE_BYPASS_MS       700          // avance recto (tras perder el lateral) antes del arco
#define NAV_LINE_ALIGN_MS        1100         // al tocar la línea: pivote máximo para retomar el sentido
#define NAV_RETURN_MAX_MS        10000        // sin ver la línea: buscar en vaivén

// --- Seguimiento de línea con un solo sensor (modo autónomo sin rumbo) ----
// El TCS34725 entrega una lectura cada ~120 ms: el robot no debe girar rápido
// para no pasar por encima de la línea entre dos lecturas.
// Seguimiento del borde: sobre color pivota alejándose de la línea; sobre
// blanco, hacia ella. Si el blanco dura LINE_LOST_MS, busca en vaivén con
// amplitud creciente, empezando por el lado donde vio la línea por última vez.
//
// ZONA MUERTA: en el suelo los motores TT no arrancan por debajo de ~30-35 %
// (con 28-30 % el robot se quedaba quieto). Toda rueda que deba moverse va a
// LINE_FOLLOW_SPEED / LINE_RETURN_SPEED / LINE_SEARCH_SPEED; la rueda izquierda
// pierde además MOTOR_LEFT_SPEED_OFFSET (45 -> 37 %). Si no se mueve, súbelos de 5 en 5.
// Los giros se hacen PIVOTANDO (una rueda quieta): girar en el sitio con las
// dos ruedas es el doble de rápido y se pasa la línea.
// VELOCIDAD ASIMÉTRICA: sobre la línea va rápido (FOLLOW); al salir a blanco vuelve
// más despacio (RETURN) para no cruzar la cinta entre dos lecturas del sensor.
// Simulado: 70/70 la pierde hasta 5,6 s en curvas cerradas; 70/55 nunca más de
// 0,5 s y avanza ~45 % más rápido que 45/45.
#define LINE_FOLLOW_SPEED        70           // % de la rueda exterior sobre la línea (se aleja)
#define LINE_RETURN_SPEED        55           // % de la rueda exterior sobre blanco (vuelve a la línea)
#define LINE_ARC_INNER_RATIO     0.0f         // rueda interior (0 = pivota). Subir solo si los
                                              // motores se mueven a FOLLOW*RATIO (curva más abierta)
#define LINE_LOST_MS             400          // blanco más tiempo que esto: línea perdida
#define LINE_SEARCH_SPEED        45           // % de la rueda derecha al barrer pivotando sobre la izquierda
#define LINE_SWEEP_MS            250          // duración del primer barrido; luego 2x, 3x...
#define LINE_SWEEP_STEPS         8            // barridos antes de reiniciar el vaivén

// Evitador automático en modo MANUAL (gira solo si el usuario no conduce).
// 0 = desactivado: MANUAL y AUTONOMO son mutuamente excluyentes (RF-03).
#define MANUAL_AUTO_AVOID        0

// --- Cadencia de tareas (no bloqueante) -----------------------------------
#define HEARTBEAT_MS             1000

// ===========================================================================
// SENSORES (Fase 4). Valores PROPUESTOS salvo los tomados del datasheet.
// ===========================================================================

// --- I2C generico ---------------------------------------------------------
#define I2C_TX_TIMEOUT_MS        50

// --- Brujula QMC5883L (0x0D) ---------------------------------------------
#define QMC_REG_DATA             0x00         // X_L,X_H,Y_L,Y_H,Z_L,Z_H
#define QMC_REG_STATUS           0x06         // bit0=DRDY, bit1=OVL, bit2=DOR
#define QMC_REG_CTRL1            0x09
#define QMC_REG_CTRL2            0x0A
#define QMC_REG_SETRESET         0x0B
#define QMC_REG_CHIP_ID          0x0D
#define QMC_CHIP_ID_VALUE        0xFF
// CTRL1 = OSR=512, RNG=+-8G, ODR=200Hz, MODE=continuous
#define QMC_CTRL1_200HZ_8G       0x1D
#define QMC_STATUS_READY         0x01
#define QMC_STATUS_OVERFLOW      0x02
#define QMC_READ_PERIOD_MS       50
#define QMC_DECLINATION_DEG      0.0f         // ajustar por zona (Bogota ~ -6.5)
#define QMC_MOUNT_OFFSET_DEG     0.0f         // desfase de montaje (calibrar)
#define QMC_MIN_MAGNITUDE        50.0f        // por debajo: lectura no fiable

// --- Color TCS34725 (0x29) ------------------------------------------------
#define TCS_REG_ENABLE           0x00
#define TCS_REG_ATIME            0x01
#define TCS_REG_WTIME            0x03
#define TCS_REG_CONTROL          0x0F
#define TCS_REG_ID               0x12
#define TCS_REG_CDATA            0x14         // C_L,C_H,R_L,R_H,G_L,G_H,B_L,B_H
#define TCS_CMD_BIT              0x80         // bit de comando
#define TCS_CMD_AUTOINC          0x20         // auto-incremento (lectura en bloque)
#define TCS_ID_34725             0x44
#define TCS_ID_34727             0x4D
#define TCS_ATIME                0xD5         // 2.4 ms * (256-0xD5) = 103.2 ms
#define TCS_WTIME                0xD5
#define TCS_GAIN_16X             0x02
#define TCS_ENABLE_PON           0x01
#define TCS_ENABLE_AEN           0x02
#define TCS_READ_PERIOD_MS       120
// Umbrales calibrados en banco el 2026-11-23 (16x, 103 ms, LED del módulo,
// sensor tapado contra la luz ambiente). Datos: tools/datos_color/color_2026-11-23_1058.csv
// (450 lecturas, 3 posiciones por color). Rangos medidos:
//   rojo  tono 3-4°,  sat 0.81-0.84      amarillo tono 33-36°, sat 0.73-0.75
//   blanco tono 35-36°, clear 17501-22596  negro tono 38-41°, clear 4985-7654
//   verde tono 102-105°                    azul  tono 183-189°
// Si cambia el montaje, la altura, el LED o la superficie: repetir con
// tools/calibrar_color.py y ajustar estos valores.
#define TCS_DARK_CLEAR           300          // casi sin luz: NEGRO (el tono es ruido)
#define TCS_RED_HUE_MAX          15.0f        // rojo: tono < 15° ...
#define TCS_RED_HUE_WRAP         330.0f       // ... o >= 330°
#define TCS_RED_SAT_MIN          0.50f        // y saturado (un blanco cálido no es rojo)
#define TCS_WARM_HUE_MAX         70.0f        // 15-70°: amarillo, blanco o negro (LED cálido)
#define TCS_GREEN_HUE_MAX        160.0f       // 70-160°: VERDE
#define TCS_BLUE_HUE_MAX         260.0f       // 160-260°: AZUL; 260-330°: DESCONOCIDO
#define TCS_YELLOW_SAT_MIN       0.66f        // zona cálida saturada -> AMARILLO (amarillo >= 0.73; negro/blanco <= 0.58)
#define TCS_BW_CLEAR_SPLIT       9500         // zona cálida poco saturada: < NEGRO, >= BLANCO (negro <= 7654; blanco >= 12361)

// --- Obstaculos HC-SR04 (GPIO) --------------------------------------------
#define SONAR_TIMEOUT_US         30000        // ~5 m ida+vuelta; si no, "sin eco"
#define SONAR_MIN_CM             2.0f
#define SONAR_MAX_CM             400.0f
#define SONAR_PERIOD_MS          90           // 3 sensores: 30 ms por sensor
#define SONAR_STAGGER_US         30000        // separacion entre disparos (>= timeout)
#define SOUND_CM_PER_US          0.0345f      // 345 m/s a ~25 C (temp. ambiente típica)
                      // Ajustar si se conoce temperatura exacta:
                      // a 20°C: 0.0343, a 25°C: 0.0345, a 30°C: 0.0348

// --- Encoders -------------------------------------------------------------
// El motor TT trae 1 salida de encoder (eje D): NO hay cuadratura. La
// direccion se infiere del sentido de giro comandado.
#define ENCODER_USE_QUADRATURE   0            // 1 si el encoder tuviera canal B
#define ENCODER_SAMPLE_MS        100

#endif // CONFIG_H
