#ifndef CONFIG_H
#define CONFIG_H

// ===========================================================================
// Config.h - Unica fuente de verdad del firmware (pines, versiones, constantes)
// Robot movil inteligente ESP32-S3
// Cualquier cambio de hardware se hace SOLO aqui.
// ===========================================================================

// --- Identificacion -------------------------------------------------------
#define FIRMWARE_NAME            "robot-movil-esp32s3"
#define FIRMWARE_VERSION         "0.2.0-sensors" // Fase 4: modulos de sensores
#define PROTOCOL_VERSION         1

// --- Comunicacion serie ---------------------------------------------------
#define SERIAL_BAUD              115200

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

// --- Sensor de obstaculos HC-SR04 -----------------------------------------
#define SONAR_TRIG_PIN           10
#define SONAR_ECHO_PIN           11           // requiere divisor 5V->3.3V

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
#define MANEUVER_MS              700
#define COMMAND_TTL_MS           500          // deadman: caducidad de comando

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
#define TCS_ATIME                0xEB         // 2.4 ms * (256-0xEB) = 50.4 ms
#define TCS_WTIME                0xEB
#define TCS_GAIN_4X              0x01
#define TCS_ENABLE_PON           0x01
#define TCS_ENABLE_AEN           0x02
#define TCS_READ_PERIOD_MS       60
#define TCS_BLACK_CLEAR_MAX      200          // clear bajo -> NEGRO
#define TCS_WHITE_SAT_MAX        0.20f        // saturacion baja + claro alto -> BLANCO

// --- Obstaculos HC-SR04 (GPIO) --------------------------------------------
#define SONAR_TIMEOUT_US         30000        // ~5 m ida+vuelta; si no, "sin eco"
#define SONAR_MIN_CM             2.0f
#define SONAR_MAX_CM             400.0f
#define SONAR_PERIOD_MS          60
#define SOUND_CM_PER_US          0.0343f      // 343 m/s a ~20 C

// --- Encoders -------------------------------------------------------------
// El motor TT trae 1 salida de encoder (eje D): NO hay cuadratura. La
// direccion se infiere del sentido de giro comandado.
#define ENCODER_USE_QUADRATURE   0            // 1 si el encoder tuviera canal B
#define ENCODER_SAMPLE_MS        100

#endif // CONFIG_H
