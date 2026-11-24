/* ===========================================================================
 * jarvis_kb.js - Base de conocimiento TECNICA de JARVIS (RF-09).
 *
 * Fuente unica para la app web (window.JarvisKB / require) y para Streamlit
 * (app/streamlit/jarvis.py extrae el JSON entre los marcadores KB-JSON).
 * El bloque entre marcadores debe ser JSON ESTRICTO (comillas dobles, sin
 * comas finales, sin comentarios).
 *
 * Datos tomados de firmware/esp32s3_robot/Config.h (fuente de verdad),
 * hardware/pinout.md, hardware/bom.md y docs/. Si cambia el hardware, se
 * actualiza aqui. Palabras clave: minusculas y SIN acentos; una palabra suelta
 * coincide como prefijo de palabra ("conect" -> "conectado", "conecta").
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JarvisKB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KB = /*KB-JSON-START*/{
  "topics": [
    {
      "id": "alimentacion",
      "keys": ["alimentacion", "bateria", "baterias", "3s", "18650", "bms", "buck", "regulador", "fusible", "voltaje", "tension", "energia", "consumo", "celda", "celdas", "carga", "interruptor", "fuente", "parte electrica", "circuito electrico", "esquema electrico", "como se alimenta", "tierra comun", "gnd comun"],
      "text": "La alimentación sale de un banco Li-ion 3S de tres celdas 18650: 11,1 V nominal y 12,6 V con la batería llena. Pasa por un BMS 3S, un interruptor y un fusible, y luego se divide en dos reguladores buck. El buck A baja a 6 V y alimenta VM del TB6612, es decir, la potencia de los motores. El buck B baja a 5 V y alimenta la ESP32-S3, cuyo regulador interno genera los 3,3 V de la lógica y de los sensores. Todas las tierras son comunes: batería, BMS, ambos buck, driver, ESP32-S3 y sensores. Los motores nunca se alimentan desde un GPIO ni desde el regulador de la placa.",
      "facts": [
        { "keys": ["por que dos", "dos buck", "dos reguladores", "separar", "separada", "ruido"], "text": "Se usan dos buck para separar la potencia de la lógica. Los motores TT generan picos de corriente y ruido al arrancar y al invertir el giro; si compartieran regulador con la ESP32-S3, una caída de tensión podría reiniciar el microcontrolador o corromper las lecturas I²C. Por eso los motores van a 6 V por el buck A y la lógica a 5 V por el buck B, con tierra común." },
        { "keys": ["condensador", "condensadores", "desacoplo", "capacitor", "1000", "100 nf", "100nf"], "text": "El diseño pide un condensador electrolítico de 1000 µF junto a VM del TB6612, para absorber los picos de corriente de los motores, y uno cerámico de 100 nF junto a la alimentación de cada sensor, para filtrar el ruido de alta frecuencia." },
        { "keys": ["6 v", "6v", "seis voltios", "por que 6"], "text": "Los motores TT están pensados para unos 3 a 6 V. Alimentarlos directamente con los 12,6 V de la batería los sobrecalentaría y acortaría su vida, así que el buck A fija 6 V en VM del driver. La velocidad se regula después con el PWM del TB6612." },
        { "keys": ["bms", "proteccion", "sobrecarga", "fusible", "seguridad electrica"], "text": "La protección eléctrica tiene tres niveles. El BMS 3S protege las celdas contra sobrecarga, sobredescarga y cortocircuito, y equilibra las tres celdas. El fusible corta si hay un cortocircuito aguas abajo. El interruptor general permite desconectar todo el robot. La carga se hace siempre supervisada." },
        { "keys": ["cuanto dura", "autonomia de la bateria", "duracion de la bateria", "corriente total", "consumo total"], "text": "No tengo una medición del consumo ni de la autonomía real de la batería; ese dato no se ha medido en el robot. Se puede estimar midiendo con el multímetro la corriente en la salida de cada buck con los motores en marcha." }
      ]
    },
    {
      "id": "motores",
      "keys": ["tb6612", "driver", "puente h", "puente", "motor tt", "motores tt", "motores", "motor", "stby", "standby", "ain1", "ain2", "bin1", "bin2", "pwma", "pwmb", "ao1", "bo1", "sentido de giro", "invertido", "zona muerta", "offset", "desbalance", "ruedas", "traccion", "diferencial"],
      "text": "Los dos motores TT se controlan con un TB6612FNG, un doble puente H. Motor izquierdo: AIN1 en GPIO 4, AIN2 en GPIO 5 y PWMA en GPIO 6. Motor derecho: BIN1 en GPIO 7, BIN2 en GPIO 15 y PWMB en GPIO 16. STBY va al GPIO 18. Los pines IN fijan el sentido de giro y el pin PWM fija la potencia. El driver tiene VCC a 3,3 V para la lógica y VM a 6 V para los motores. El robot es diferencial: avanza con ambas ruedas iguales y gira variando la diferencia de velocidad entre ellas.",
      "facts": [
        { "keys": ["stby", "standby", "estado seguro", "habilita"], "text": "STBY es la habilitación del TB6612 y está en el GPIO 18. Con STBY en bajo el driver queda deshabilitado y los motores no pueden moverse, que es el estado seguro. El firmware lo pone en bajo al arrancar, lo sube a alto solo cuando el control se arma y lo vuelve a bajar con STOP, con el deadman o con la parada de emergencia. Esto se confirmó en banco el 7 de noviembre de 2026." },
        { "keys": ["sentido", "direccion de giro", "in1", "in2", "como cambia", "invertir", "invertido", "logica del puente"], "text": "En el TB6612, IN1 alto e IN2 bajo hacen girar el motor en un sentido; IN1 bajo e IN2 alto, en el contrario; los dos bajos lo dejan libre y los dos altos lo frenan en cortocircuito. El montaje dejó un motor girando al revés, y se corrige por software con MOTOR_L_INVERT igual a 1 en Config.h. La alternativa física es intercambiar los cables de salida AO1 y AO2." },
        { "keys": ["zona muerta", "no arranca", "no se mueve", "minimo", "30"], "text": "En el suelo los motores TT no arrancan por debajo de un 30 a 35 por ciento de PWM: con 28 a 30 por ciento el robot se quedaba quieto por el rozamiento. Por eso el seguimiento de línea usa 70 y 55 por ciento, y la velocidad manual por defecto es 40 por ciento." },
        { "keys": ["offset", "desbalance", "se desvia", "se va de lado", "recto", "compensa"], "text": "Los dos motores TT no giran exactamente igual, así que el robot tiende a desviarse. Config.h lo compensa con MOTOR_LEFT_SPEED_OFFSET igual a menos 8, que resta un 8 por ciento a la rueda izquierda, y MOTOR_RIGHT_SPEED_OFFSET igual a 0. Si el robot se inclina hacia un lado se ajustan esos valores." }
      ]
    },
    {
      "id": "pwm",
      "keys": ["pwm", "ledc", "ciclo de trabajo", "duty", "modulacion", "20 khz", "20khz", "frecuencia del pwm", "resolucion", "8 bits", "potencia de los motores", "velocidad de los motores"],
      "text": "La velocidad de los motores se controla con PWM usando el periférico LEDC de la ESP32-S3, que genera la señal por hardware con sus propios timers, sin cargar la CPU. La frecuencia es 20 kHz y la resolución 8 bits, así que el ciclo de trabajo va de 0 a 255. La app envía la velocidad en porcentaje de 0 a 100 y el firmware la convierte en ciclo de trabajo: por ejemplo, 50 por ciento son unos 128 de 255. En el código se usan ledcAttach y ledcWrite sobre PWMA, en GPIO 6, y PWMB, en GPIO 16.",
      "facts": [
        { "keys": ["por que 20", "20 khz", "20khz", "audible", "zumbido", "pitido"], "text": "Se eligieron 20 kHz porque está por encima del rango audible humano. A frecuencias bajas, como 1 kHz, los bobinados del motor zumban de forma molesta. A 20 kHz el TB6612 conmuta sin problema, ya que admite hasta 100 kHz, y con 8 bits de resolución el reloj del LEDC cubre esa frecuencia con holgura." },
        { "keys": ["resolucion", "8 bits", "255", "por que 8"], "text": "Con 8 bits el ciclo de trabajo tiene 256 niveles, de 0 a 255, que es más que suficiente para motores TT. Además, en el LEDC la frecuencia máxima depende de la resolución: más bits obligan a una frecuencia más baja, y 8 bits permiten trabajar a 20 kHz." }
      ]
    },
    {
      "id": "timers",
      "keys": ["timer", "timers", "temporizador", "temporizadores", "millis", "micros", "tiempos", "periodo", "periodos", "tiempo real", "no bloqueante", "bloqueante", "delay", "cadencia", "frecuencia de muestreo", "muestreo", "scheduler", "planificacion", "cada cuanto", "loop", "deadman", "hombre muerto"],
      "text": "El firmware es no bloqueante: no usa delay en el bucle principal. Cada tarea guarda el instante de su última ejecución y se ejecuta cuando millis o micros superan su periodo. Los periodos son: brújula cada 50 ms, sensor de color cada 120 ms, ultrasonidos cada 90 ms escalonados 30 ms entre sí, encoders cada 100 ms, decisión del piloto autónomo cada 50 ms, telemetría por WebSocket cada 200 ms y latido serie cada 1 segundo. Los timers por hardware se usan en el PWM del LEDC, y la medición del eco ultrasónico se hace con interrupciones y micros. Las restas de tiempo se hacen con enteros sin signo, así que funcionan aunque el contador se desborde.",
      "facts": [
        { "keys": ["desborda", "overflow", "49 dias", "rollover", "sin signo"], "text": "millis desborda cada 49,7 días y micros cada 71,6 minutos. El firmware compara siempre restando, del tipo ahora menos inicio mayor o igual que periodo, con enteros sin signo de 32 bits. Con aritmética modular esa resta da el resultado correcto aunque el contador haya dado la vuelta." },
        { "keys": ["hardware timer", "timer de hardware", "hw timer", "timerbegin", "interrupcion de timer"], "text": "El proyecto no usa interrupciones de timer de hardware para planificar tareas; usa planificación cooperativa con millis y micros dentro del loop, que es más simple y suficiente para periodos de 50 a 200 ms. Los timers de hardware sí trabajan en el periférico LEDC, que genera el PWM de los motores, y la medición precisa del eco se hace con interrupciones por cambio de pin y micros." },
        { "keys": ["deadman", "ttl", "caduca", "caducidad", "500 ms", "hombre muerto"], "text": "El deadman es un temporizador de seguridad. Cada orden de movimiento recibida por WebSocket solo vale COMMAND_TTL_MS, 500 ms, medidos con millis desde que llega. La app la reenvía mientras se mantiene pulsado el botón; si deja de llegar, por ejemplo porque se cae el WiFi, los motores se detienen solos. En modo autónomo cada consigna vale 200 ms, y en manual existe además un tiempo máximo de movimiento y otro de armado sin uso." }
      ]
    },
    {
      "id": "interrupciones",
      "keys": ["interrupcion", "interrupciones", "isr", "iram", "attachinterrupt", "flanco", "rising", "change", "volatile", "pulsein"],
      "text": "Se usan interrupciones de pin en dos sitios. En los HC-SR04, el pin ECHO de cada sensor tiene una interrupción por cambio, CHANGE: en el flanco de subida la rutina guarda micros y en el de bajada calcula la anchura del pulso. Así se mide el eco sin bloquear el programa con pulseIn. En los encoders, el canal A tiene una interrupción por flanco de subida, RISING, que suma o resta un pulso según el sentido de giro ordenado. Las rutinas son mínimas, solo guardan tiempos o cuentas, y el cálculo pesado se hace después en el loop.",
      "facts": [
        { "keys": ["pulsein", "por que no pulsein", "bloquea"], "text": "pulseIn bloquea la CPU mientras espera el eco, hasta 30 ms por sensor. Con tres sensores serían hasta 90 ms parados, sin atender el WebSocket ni los motores. Con la interrupción por cambio, el pin ECHO marca el inicio y el fin del pulso y el loop sigue libre." },
        { "keys": ["iram", "iram attr", "iram_attr"], "text": "IRAM_ATTR coloca la rutina de interrupción en la RAM interna en lugar de la flash. Así puede ejecutarse aunque la caché de la flash esté ocupada, por ejemplo durante operaciones de WiFi, y se evitan bloqueos del sistema. Se usa en la rutina del encoder." }
      ]
    },
    {
      "id": "i2c",
      "keys": ["i2c", "i 2 c", "sda", "scl", "bus", "pull up", "pullup", "pull-up", "direccion i2c", "0x0d", "0x29", "wire", "escaner", "dos hilos"],
      "text": "La brújula QMC5883L y el sensor de color TCS34725 comparten el bus I²C: SDA en GPIO 8 y SCL en GPIO 9, a 100 kHz, con resistencias pull-up de 4,7 kΩ a 3,3 V. Cada chip tiene su dirección: la brújula 0x0D y el sensor de color 0x29, así que no chocan. Ambos se alimentan a 3,3 V. Al arrancar, el diagnóstico escanea el bus y confirma qué direcciones responden. Las lecturas usan un inicio repetido, repeated start, y leen en bloque varios registros seguidos.",
      "facts": [
        { "keys": ["100 khz", "100khz", "400", "velocidad del bus", "por que 100"], "text": "El bus va a 100 kHz, modo estándar, en lugar de 400 kHz, porque es más robusto con cables Dupont largos y con el ruido de los motores. Los datos que se leen son pocos, 6 bytes de la brújula y 8 del color, así que 100 kHz sobra." },
        { "keys": ["pull", "resistencia", "4 7", "4.7", "4,7"], "text": "I²C es un bus de drenador abierto: los dispositivos solo tiran la línea a cero, y las resistencias pull-up la devuelven a uno. Se usan 4,7 kΩ a 3,3 V en SDA y SCL, un valor típico para 100 kHz. Muchos módulos ya traen pull-ups integradas; si hay varias en paralelo, la resistencia equivalente baja." },
        { "keys": ["no responde", "error i2c", "i2c_error", "falla", "fallo"], "text": "Si un sensor I²C no responde, la lectura queda marcada como no válida y el protocolo puede reportar I2C_ERROR. El sensor de color detecta además si se reinició, porque devuelve todo en cero, y se reconfigura solo. Para depurar, conviene revisar alimentación a 3,3 V, tierra común, SDA y SCL no cruzados, y las direcciones 0x0D y 0x29 en el escáner del arranque." }
      ]
    },
    {
      "id": "brujula",
      "keys": ["brujula", "qmc5883", "qmc5883l", "gy-271", "gy 271", "magnetometro", "rumbo", "heading", "norte", "atan2", "declinacion", "hard iron", "soft iron", "hierro"],
      "text": "La brújula es un magnetómetro QMC5883L en un módulo GY-271, por I²C en la dirección 0x0D. Se configura en modo continuo a 200 Hz, rango de 8 gauss y sobremuestreo de 512, y el firmware la lee cada 50 ms. Lee los registros 0x00 a 0x05, que son X, Y y Z de 16 bits, y calcula el rumbo como atan2 de Y entre X, en grados. Luego le suma la declinación magnética y el desfase de montaje, y lo ajusta al rango de 0 a 360. Si la magnitud del campo es menor que 50, o el chip indica desbordamiento, la lectura se marca como no válida.",
      "facts": [
        { "keys": ["calibr", "hard iron", "soft iron", "offset"], "text": "La brújula se calibra en dos partes. Hard iron: se resta un desplazamiento en X e Y causado por imanes fijos, como los de los motores. Soft iron: se escala cada eje para que el círculo de lecturas no quede deformado en elipse. Se obtienen girando el robot 360 grados y tomando el centro y los radios de los valores mínimos y máximos. El comando de calibración por la app aún no está implementado: responde UNSUPPORTED." },
        { "keys": ["declinacion", "bogota", "norte geografico", "norte verdadero"], "text": "La brújula mide el norte magnético. La declinación es el ángulo entre el norte magnético y el geográfico; para Bogotá es de unos menos 6,5 grados. En Config.h QMC_DECLINATION_DEG está en 0, así que hoy el robot trabaja con el norte magnético." },
        { "keys": ["motores", "interferencia", "lejos", "iman", "por que falla"], "text": "Los imanes permanentes de los motores TT y las corrientes del driver distorsionan el campo magnético. Por eso la brújula debe montarse lo más lejos posible de motores, batería y cables de potencia, por ejemplo elevada en un mástil, y calibrarse ya montada en el robot." }
      ]
    },
    {
      "id": "color",
      "keys": ["sensor de color", "color", "tcs34725", "tcs", "rgb", "tono", "hue", "saturacion", "clear", "atime", "ganancia", "integracion", "colores", "detecta colores", "clasifica"],
      "text": "El sensor de color es un TCS34725 por I²C en la dirección 0x29. Se configura con un tiempo de integración ATIME de 0xD5, que son 2,4 ms por 43 ciclos, unos 103 ms, y una ganancia de 16 veces. El firmware lo lee cada 120 ms: en una sola lectura en bloque de 8 bytes obtiene los canales clear, rojo, verde y azul de 16 bits. Después convierte RGB a tono y saturación, y clasifica en negro, blanco, rojo, amarillo, verde o azul con umbrales calibrados en banco.",
      "facts": [
        { "keys": ["clasifica", "umbral", "umbrales", "como distingue", "como sabe", "algoritmo", "tono"], "text": "La clasificación usa tono y saturación. Si el canal clear está por debajo de 300 es negro. Un tono menor de 15 grados o mayor de 330 con saturación de al menos 0,5 es rojo. Entre 15 y 70 grados, que es la zona cálida, una saturación de al menos 0,66 es amarillo; si no, se separan negro y blanco con el canal clear: por debajo de 9500 es negro y por encima, blanco. De 70 a 160 grados es verde, de 160 a 260 azul, y el resto, desconocido." },
        { "keys": ["calibr", "calibracion", "precision", "fiable"], "text": "El sensor de color se calibró en banco el 23 de noviembre de 2026, con ganancia 16 y 103 ms, el LED del módulo encendido. La luz ambiente alteraba las lecturas, así que se puso cinta aislante en el borde del sensor y se redujo su distancia al suelo. Se tomaron 450 muestras, en tres posiciones por color, con un 100 por ciento de aciertos. Si cambia la altura, el LED o la superficie, hay que repetir la calibración con tools/calibrar_color.py." },
        { "keys": ["120", "por que 120", "lento"], "text": "El sensor necesita unos 103 ms para integrar la luz de cada lectura, así que el firmware lo consulta cada 120 ms. Por eso el seguimiento de línea no gira demasiado rápido: entre dos lecturas el robot no debe cruzar la cinta sin verla." }
      ]
    },
    {
      "id": "ultrasonido",
      "keys": ["hc-sr04", "hc sr04", "hcsr04", "ultrasonico", "ultrasonicos", "ultrasonido", "sonar", "trig", "echo", "eco", "divisor", "distancia se mide", "mide la distancia", "sensor de distancia", "sensores de distancia", "frontal", "al frente", "laterales"],
      "text": "Hay tres sensores ultrasónicos HC-SR04: frontal, izquierdo y derecho. Según Config.h, el frontal usa TRIG en GPIO 40 y ECHO en GPIO 41, el izquierdo TRIG 38 y ECHO 39, y el derecho TRIG 10 y ECHO 11; el frontal y el derecho se intercambiaron en el montaje. Para medir, el firmware da un pulso de 10 µs en TRIG; el sensor emite ultrasonido a 40 kHz y pone ECHO en alto el tiempo que tarda el eco en volver. La distancia es ese tiempo por 0,0345 centímetros por microsegundo, dividido entre 2 por la ida y la vuelta. Se aceptan lecturas de 2 a 400 cm; sin eco en 30 ms, la lectura es no válida.",
      "facts": [
        { "keys": ["divisor", "5 v", "5v", "3 3", "3.3", "3,3", "proteger", "resistencia", "voltaje", "tension", "entrega"], "text": "El HC-SR04 se alimenta a 5 V y su pin ECHO entrega 5 V, pero los GPIO de la ESP32-S3 solo toleran 3,3 V. Por eso cada ECHO pasa por un divisor resistivo: ECHO, resistencia de 1 kΩ, nodo hacia el GPIO, resistencia de 2 kΩ y tierra. La tensión en el GPIO es 5 por 2 entre 3, unos 3,33 V. Sin el divisor el GPIO se puede dañar." },
        { "keys": ["escalon", "diafonia", "interferencia", "crosstalk", "30 ms", "90 ms", "al mismo tiempo"], "text": "Los tres sensores no disparan a la vez, porque el eco de uno lo podría captar otro: eso es la diafonía. El firmware los dispara escalonados, con al menos 30 ms entre disparos, que es el tiempo máximo de espera del eco, y cada sensor repite cada 90 ms." },
        { "keys": ["formula", "calcula", "0 0345", "velocidad del sonido", "temperatura"], "text": "La distancia se calcula como el tiempo de eco en microsegundos, por 0,0345 centímetros por microsegundo, dividido entre 2. La constante corresponde a la velocidad del sonido, unos 345 metros por segundo a 25 grados. Varía con la temperatura: 0,0343 a 20 grados y 0,0348 a 30 grados." },
        { "keys": ["bloqueado", "umbral", "25", "15", "cuando detecta", "obstaculo"], "text": "Un sensor considera bloqueado su lado cuando mide menos de 25 cm, OBSTACLE_DETECT_CM. La distancia de parada segura propuesta es 15 cm. Al avanzar por voz hasta un obstáculo, el robot para a 10 cm por defecto, ajustable entre 5 y 30 cm. Estos valores están propuestos y deben validarse en el robot real." }
      ]
    },
    {
      "id": "encoders",
      "keys": ["encoder", "encoders", "odometria", "pulsos", "ppr", "cuadratura", "revolucion"],
      "text": "Cada motor TT tiene un encoder de una sola salida, canal A: el izquierdo en GPIO 12 y el derecho en GPIO 14. Los pines B, GPIO 13 y 21, quedan reservados porque no hay cuadratura, ENCODER_USE_QUADRATURE igual a 0. Cada flanco de subida dispara una interrupción que suma o resta un pulso según el sentido de giro ordenado, y cada 100 ms el firmware calcula la velocidad a partir de los pulsos contados. Los pulsos por vuelta aún no se han medido, y el encoder no se usa para el control.",
      "facts": [
        { "keys": ["cuadratura", "canal b", "sentido", "direccion"], "text": "Con un encoder de cuadratura, dos canales desfasados 90 grados, el sentido de giro se deduce del orden de los flancos. El motor TT del proyecto solo tiene un canal, así que el sentido se infiere de la orden que se dio al motor. Si se cambiara a un encoder con canal B, bastaría poner ENCODER_USE_QUADRATURE en 1." }
      ]
    },
    {
      "id": "pines",
      "keys": ["pines", "pin", "gpio", "pinout", "conexiones", "conexion de", "conectado a", "conecta", "cableado", "cables", "donde va", "a que pin", "que pin", "esquema de conexiones"],
      "text": "Conexiones principales de la ESP32-S3: bus I²C con SDA en GPIO 8 y SCL en GPIO 9, para brújula y color. TB6612: AIN1 4, AIN2 5, PWMA 6, BIN1 7, BIN2 15, PWMB 16 y STBY 18. Ultrasonidos: frontal TRIG 40 y ECHO 41, izquierdo TRIG 38 y ECHO 39, derecho TRIG 10 y ECHO 11. Encoders: izquierdo en GPIO 12 y derecho en GPIO 14, con 13 y 21 reservados. Botón de parada en GPIO 47 a tierra, con pull-up interna. Los sensores I²C van a 3,3 V, los HC-SR04 a 5 V con divisor en ECHO, y todas las tierras son comunes.",
      "facts": [
        { "keys": ["no usados", "reservados", "strapping", "evitar", "prohibidos", "no se pueden usar"], "text": "Se evitan los GPIO 0, 3, 45 y 46 porque son pines de strapping y afectan el arranque; los GPIO 19 y 20 porque son el USB nativo; y del 26 al 37 porque los usan la flash y la PSRAM internas de la versión N16R8." },
        { "keys": ["boton", "47", "parada fisica", "pulsador"], "text": "El botón de parada está en el GPIO 47, conectado a tierra y con la resistencia pull-up interna activada: en reposo se lee alto y pulsado, bajo. Si se mantiene pulsado 50 ms, que sirve de antirrebote, el firmware activa la parada de emergencia. Está implementado, pero la prueba física sigue pendiente." }
      ]
    },
    {
      "id": "wifi",
      "keys": ["wifi", "wi-fi", "red", "access point", "punto de acceso", "ap", "sta", "ssid", "contrasena", "clave", "ip", "192 168", "router", "inalambric"],
      "text": "La ESP32-S3 levanta siempre un punto de acceso WiFi propio: la red se llama robot-esp32s3, con la contraseña robot1234, en el canal 6 y con un máximo de 4 clientes. La IP de la placa es 192.168.4.1 y el servidor WebSocket escucha en el puerto 81, así que la app se conecta a ws://192.168.4.1:81. También puede conectarse a un router como estación, STA, si se configuran credenciales en Config.h. El ahorro de energía del WiFi está desactivado para reducir la latencia. Esta red no tiene internet, por eso el reconocimiento de voz de Chrome puede fallar mientras estás conectado a ella.",
      "facts": [
        { "keys": ["por que ap", "router", "sin router", "por que punto de acceso"], "text": "Se usa el modo punto de acceso para que el robot funcione en cualquier sitio sin depender de un router: el computador o el celular se conectan directamente a la red del robot. El inconveniente es que esa red no da internet." },
        { "keys": ["se cae", "se pierde", "pierde la conexion", "desconecta", "se corta", "sin conexion"], "text": "Si se cae el WiFi en modo manual, el robot se detiene solo; el modo autónomo no se detiene por perder el WiFi. Cada orden de movimiento caduca a los 500 ms, el deadman, y la app ya no puede reenviarla, así que los motores paran. Además, el servidor WebSocket envía latidos cada 15 s y cierra los clientes que no responden. Al volver la conexión, la app repite el saludo hello y recibe de nuevo la telemetría." }
      ]
    },
    {
      "id": "protocolo",
      "keys": ["protocolo", "websocket", "web socket", "json", "mensaje", "mensajes", "comunicacion", "comunica", "telemetria", "handshake", "hello", "ack", "trama", "comandos del protocolo", "como se comunica"],
      "text": "La app y el robot se comunican por WebSocket sobre WiFi con mensajes JSON, uno por trama, versión 1 del protocolo. Cada mensaje lleva el tipo, en el campo t, y la versión, en el campo v. La app envía: hello para el saludo inicial, ping, mode con manual o autónomo, que además lleva el submodo evadir, rumbo o linea, drive con dirección y velocidad de 0 a 100, heading con el rumbo deseado, estop y status. El robot responde con ack o error, y cada 200 ms envía un mensaje telemetry con modo, rumbo actual, deseado y error, color, las tres distancias, motores, estado de navegación y parada de emergencia. También envía eventos, como OBSTACLE_REACHED.",
      "facts": [
        { "keys": ["error", "errores", "codigos", "bad_format", "rechaza"], "text": "Los códigos de error del protocolo son: BAD_FORMAT, JSON inválido o campo erróneo; UNKNOWN_CMD, tipo desconocido; UNSUPPORTED, no permitido en el modo actual; SAFETY, rechazado por parada de emergencia; I2C_ERROR, sensor que no responde; SENSOR_INVALID, lectura fuera de rango; y VERSION_MISMATCH, versión incompatible. Ante cualquier fallo de parseo el robot no ejecuta nada y responde error." },
        { "keys": ["por que websocket", "http", "tcp", "por que no http"], "text": "WebSocket mantiene una única conexión TCP abierta y en las dos direcciones. Así el robot empuja la telemetría cada 200 ms sin que la app tenga que preguntar, y los comandos llegan con poca latencia. Con HTTP habría que abrir una petición por cada mensaje. El servidor además envía latidos cada 15 s para detectar clientes caídos." },
        { "keys": ["valid", "null", "invalido", "no disponible"], "text": "La telemetría distingue tres casos y no los mezcla: un dato válido; un dato no disponible, que va como null; y un dato inválido, marcado con valid igual a false. Por ejemplo, un ultrasonido sin eco envía valid false y distance_cm null." }
      ]
    },
    {
      "id": "seguridad",
      "keys": ["seguridad", "parada de emergencia", "estop", "e-stop", "emergencia", "safe", "enclavad", "watchdog", "falla segura", "fail safe", "deadman"],
      "text": "La seguridad tiene varias capas. La parada de emergencia, por la app, por voz o con el botón del GPIO 47, lleva la máquina de estados a SAFE, baja STBY y detiene los motores; queda enclavada hasta reiniciar la placa. El deadman detiene los motores si las órdenes dejan de llegar durante 500 ms. Al arrancar, STBY está en bajo, así que el driver empieza deshabilitado. Manual y autónomo son excluyentes. Y al avanzar por voz hasta un obstáculo, el robot se detiene si el sensor frontal pierde la lectura más de 300 ms."
    },
    {
      "id": "fsm",
      "keys": ["maquina de estados", "fsm", "estados", "boot", "idle", "modos", "transicion", "transiciones", "fsmglobal"],
      "text": "La máquina de estados global, FSMGlobal, tiene los estados BOOT, IDLE, MANUAL, AUTONOMO, SAFE y ERROR. Arranca en BOOT con los motores en estado seguro y pasa a IDLE. Desde ahí el comando mode lleva a MANUAL o a AUTONOMO, que son mutuamente excluyentes: cambiar de uno a otro siempre pasa por desarmar. SAFE se puede activar desde cualquier estado con la parada de emergencia y tiene prioridad absoluta. Es la única autoridad sobre los motores."
    },
    {
      "id": "navegacion",
      "keys": ["navegacion", "navigator", "submodo", "autonomo", "modo autonomo", "evadir", "evasion", "esquiva", "evita", "bordear", "reorientar", "retroceder", "control proporcional", "kp", "controlador", "control p", "pid", "error angular"],
      "text": "El modo autónomo tiene tres submodos que se eligen antes de arrancar: solo esquivar obstáculos, avanzando recto; seguir un rumbo con la brújula y esquivar; o seguir una línea de color y esquivar. El Navigator decide cada 50 ms. Ante un obstáculo frontal entra en EVADIR, gira hacia el lado más libre y un poco más para no rozarlo; luego BORDEAR, avanzando hasta dejarlo atrás. Después, según el submodo, sigue recto, pasa a REORIENTAR hasta recuperar el rumbo, o a VOLVER y ALINEAR para reencontrar la línea. En rumbo aplica un control proporcional con Kp 0,8 limitado a 30 por ciento, y si la brújula falla sigue avanzando y esquivando hasta recuperarla. Si los tres sensores están bloqueados, retrocede 400 ms.",
      "facts": [
        { "keys": ["error angular", "como calcula el error", "menos 180", "-180", "diferencia"], "text": "El error es la diferencia angular más corta entre el rumbo deseado y el actual: deseado menos actual, más 540, módulo 360, menos 180. Queda entre menos 180 y 180 grados. Así, ir de 350 a 10 grados da un error de más 20, y no de menos 340. Si es positivo, el robot debe girar a la derecha." },
        { "keys": ["por que proporcional", "pid", "integral", "derivativo", "kp"], "text": "Se usa un control proporcional porque la brújula se lee cada 50 ms y los motores TT tienen zona muerta: un integral acumularía error mientras las ruedas no responden. Kp igual a 0,8 y el límite del 30 por ciento son valores propuestos, a ajustar en pruebas. La arquitectura prevé un PI si el error en régimen permanente resultara grande." }
      ]
    },
    {
      "id": "linea",
      "keys": ["linea", "seguidor", "seguir la linea", "seguimiento", "cinta", "borde", "buscar linea", "barrido", "vaiven"],
      "text": "En el submodo línea el robot sigue el borde de cualquier color que no sea blanco, con un solo sensor TCS34725. Sobre la línea pivota alejándose al 70 por ciento; sobre blanco pivota hacia ella al 55 por ciento. Si ve blanco más de 400 ms entra en BUSCAR_LINEA, con barridos de vaivén cada vez más amplios. Ante un obstáculo lo rodea, entra en VOLVER, un arco lento hacia el lado donde quedó la línea, y al tocarla pasa a ALINEAR, que pivota para retomar el sentido de marcha."
    },
    {
      "id": "esp32",
      "keys": ["esp32", "esp32-s3", "esp32s3", "microcontrolador", "n16r8", "placa", "procesador", "psram", "flash", "nucleos"],
      "text": "El cerebro es una ESP32-S3 DevKit N16R8: un microcontrolador de doble núcleo Xtensa LX7 a 240 MHz, con 16 MB de flash, 8 MB de PSRAM, WiFi de 2,4 GHz y Bluetooth LE, sin Bluetooth clásico. Su lógica es de 3,3 V y la placa se alimenta a 5 V. El firmware se escribe en C++ con el framework de Arduino y se compila con arduino-cli. El nombre del firmware es robot-movil-esp32s3, versión 0.4.0-nav."
    },
    {
      "id": "firmware",
      "keys": ["firmware", "modulos", "arquitectura", "codigo", "estructura del codigo", "archivos", "config h", "programa"],
      "text": "El firmware está dividido en módulos, uno por archivo. Config.h es la única fuente de verdad de pines y constantes. MotorDriver controla el TB6612. Compass, ColorSensor, ObstacleSensor y Encoder leen los sensores. ControlManual gestiona el armado, las consignas y el deadman. Navigator es la máquina de navegación autónoma. FSMGlobal maneja los modos y la parada de emergencia. Protocol, Wireless y Telemetry implementan el WiFi, el WebSocket y el JSON. Diagnostics muestra el banner de arranque y escanea el I²C. El loop actualiza todo sin bloquear."
    },
    {
      "id": "voz",
      "keys": ["voz", "reconocimiento", "microfono", "web speech", "speech", "hablar", "sintesis"],
      "text": "La voz usa la Web Speech API del navegador. El reconocimiento convierte lo que dices en texto, y después se interpreta: si es una pregunta, respondo yo; si es una orden, como adelante, detente, modo manual o rumbo 90, se envía al robot. Mis respuestas se leen en voz alta con la síntesis de voz del navegador. El micrófono exige un contexto seguro, localhost o HTTPS, y en Chrome el reconocimiento necesita internet."
    }
  ]
}/*KB-JSON-END*/;
  return KB;
});
