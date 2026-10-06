/**
 * ==============================================================================
 * Smart Library Seat Finder - ESP8266 NodeMCU Firmware
 * Academic IoT Prototype (~BDT 4,000 Budget)
 * 
 * Hardware:
 *   - ESP8266 NodeMCU v2 / v3
 *   - 4x IR Obstacle Sensors (TCRT5000 / FC-51) on D1, D2, D5, D6
 *   - 1x Digital Sound Detection Module (LM393) on D7
 *   - 1x Active 5V Buzzer driven via NPN Transistor (2N2222) on D0
 * ==============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>

// Include optional local configuration header if it exists
#if __has_include("config.h")
  #include "config.h"
#else
  // Default fallback definitions (Replace before flashing or create config.h)
  #define WIFI_SSID               "YOUR_WIFI_SSID"
  #define WIFI_PASSWORD           "YOUR_WIFI_PASSWORD"
  #define API_HOST                "your-deployment.vercel.app"
  #define API_PORT                443
  #define USE_HTTPS               true
  #define DEVICE_ID               "ESP8266_DEV01"
  #define DEVICE_TOKEN            "your-random-strong-device-secret-token-here"
  #define FIRMWARE_VER            "1.0.0"

  #define PIN_SEAT_1              D1  // GPIO5
  #define PIN_SEAT_2              D2  // GPIO4
  #define PIN_SEAT_3              D5  // GPIO14
  #define PIN_SEAT_4              D6  // GPIO12
  #define PIN_SOUND_DO            D7  // GPIO13
  #define PIN_BUZZER              D0  // GPIO16
  #define PIN_STATUS_LED          D3  // GPIO0 - External Status LED (Anode to D3 via resistor, Cathode to GND)
  #define STATUS_LED_ACTIVE_LOGIC HIGH // HIGH turns ON standard external LED connected to GND

  #define IR_OCCUPIED_LOGIC       LOW
  #define SOUND_TRIGGER_LOGIC     HIGH
  #define BUZZER_ACTIVE_LOGIC     HIGH

  #define HEARTBEAT_INTERVAL_MS   10000
  #define DEBOUNCE_TIME_MS        600
  #define SOUND_DEBOUNCE_MS       200
  #define BUZZER_BEEP_DURATION_MS 1500
  #define NOISE_ALERT_COOLDOWN_MS 8000
#endif

// Pin array for seats
const uint8_t SEAT_PINS[4] = { PIN_SEAT_1, PIN_SEAT_2, PIN_SEAT_3, PIN_SEAT_4 };
const char* SEAT_IDS[4]   = { "S01", "S02", "S03", "S04" };

// Debounced Seat States
bool seatOccupied[4]          = { false, false, false, false };
bool lastRawReading[4]        = { false, false, false, false };
unsigned long lastDebounce[4] = { 0, 0, 0, 0 };

// Buzzer & Sound State
bool buzzerActive             = false;
unsigned long buzzerStartTime = 0;
unsigned long lastNoiseAlert  = 0;
unsigned long soundHighStart  = 0;
bool soundPendingAlert        = false;

// Status LED State & Timing
unsigned long lastLedBlinkTime = 0;
bool currentLedState           = false;

// Timing State
unsigned long lastHeartbeatTime = 0;
unsigned long lastWiFiCheckTime = 0;

// Function Prototypes
void connectWiFi();
void checkWiFiConnection();
void sampleSensors();
void updateBuzzerState();
void updateStatusLed();
void setStatusLed(bool on);
void sendStatusUpdate(bool force);
void sendNoiseAlert(bool noiseDetected);

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("=================================================="));
  Serial.println(F(" Smart Library Seat Finder - ESP8266 Firmware"));
  Serial.println(F(" Academic Low-Budget IoT Prototype (~BDT 4,000)"));
  Serial.println(F("=================================================="));

  // Initialize Status LED Pin
  pinMode(PIN_STATUS_LED, OUTPUT);
  setStatusLed(false);

  // Initialize Buzzer Pin
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);

  // Initialize Seat IR Sensor Pins
  for (int i = 0; i < 4; i++) {
    pinMode(SEAT_PINS[i], INPUT_PULLUP);
    bool initialRead = (digitalRead(SEAT_PINS[i]) == IR_OCCUPIED_LOGIC);
    seatOccupied[i] = initialRead;
    lastRawReading[i] = initialRead;
  }

  // Initialize Digital Sound Sensor DO Pin
  pinMode(PIN_SOUND_DO, INPUT);

  // Connect to Wi-Fi
  connectWiFi();

  // Send initial startup status
  sendStatusUpdate(true);
}

void loop() {
  unsigned long now = millis();

  // 1. Maintain Wi-Fi connectivity asynchronously (non-blocking)
  if (now - lastWiFiCheckTime > 5000) {
    lastWiFiCheckTime = now;
    checkWiFiConnection();
  }

  // 2. High-speed local sensor sampling with debouncing
  sampleSensors();

  // 3. Update local buzzer timing
  updateBuzzerState();

  // 4. Update Status LED patterns (non-blocking heartbeat / error / alert)
  updateStatusLed();

  // 5. Send periodic heartbeat / occupancy status to Next.js API
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendStatusUpdate(false);
  }

  // Yield to ESP8266 background Wi-Fi and watchdog stack
  yield();
}

/**
 * Connects to the configured Wi-Fi network with timeout and visual LED indicator
 */
void connectWiFi() {
  Serial.print(F("[WiFi] Connecting to: "));
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 8000) {
    // Fast flash while attempting connection
    setStatusLed(!currentLedState);
    delay(200);
    Serial.print(F("."));
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    setStatusLed(true);
    Serial.print(F("[WiFi] Connected! IP Address: "));
    Serial.println(WiFi.localIP());
  } else {
    setStatusLed(false);
    Serial.println(F("[WiFi] Connection pending. Loop will attempt background reconnect."));
  }
}

/**
 * Checks and non-blockingly reconnects Wi-Fi if connection was lost
 */
void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[WiFi] Disconnected! Attempting auto-reconnect..."));
    WiFi.reconnect();
  }
}

/**
 * Samples physical IR sensors and digital sound sensor with software debouncing
 */
void sampleSensors() {
  unsigned long now = millis();
  bool stateChanged = false;

  // --- A. Seat IR Sensors ---
  for (int i = 0; i < 4; i++) {
    bool rawReading = (digitalRead(SEAT_PINS[i]) == IR_OCCUPIED_LOGIC);

    if (rawReading != lastRawReading[i]) {
      lastDebounce[i] = now;
      lastRawReading[i] = rawReading;
    }

    if ((now - lastDebounce[i]) > DEBOUNCE_TIME_MS) {
      if (rawReading != seatOccupied[i]) {
        seatOccupied[i] = rawReading;
        stateChanged = true;
        Serial.print(F("[Seat] "));
        Serial.print(SEAT_IDS[i]);
        Serial.print(F(" changed to: "));
        Serial.println(seatOccupied[i] ? F("OCCUPIED") : F("AVAILABLE"));
      }
    }
  }

  // If any seat occupancy changed, immediately sync status to cloud API
  if (stateChanged) {
    sendStatusUpdate(true);
  }

  // --- B. Digital Sound Sensor DO ---
  bool soundTriggered = (digitalRead(PIN_SOUND_DO) == SOUND_TRIGGER_LOGIC);

  if (soundTriggered) {
    if (soundHighStart == 0) {
      soundHighStart = now;
    } else if ((now - soundHighStart) >= SOUND_DEBOUNCE_MS) {
      // Sound persisted beyond debounce threshold
      if ((now - lastNoiseAlert) >= NOISE_ALERT_COOLDOWN_MS) {
        lastNoiseAlert = now;
        Serial.println(F("[Noise] High acoustic threshold breached!"));

        // 1. Activate local buzzer immediately
        buzzerActive = true;
        buzzerStartTime = now;
        digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? HIGH : LOW);

        // 2. Transmit noise alert to backend API
        sendNoiseAlert(true);
      }
    }
  } else {
    soundHighStart = 0;
  }
}

/**
 * Controls local buzzer shutoff after duration expires (Non-blocking)
 */
void updateBuzzerState() {
  if (buzzerActive) {
    unsigned long now = millis();
    if (now - buzzerStartTime >= BUZZER_BEEP_DURATION_MS) {
      buzzerActive = false;
      digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
      Serial.println(F("[Buzzer] Alert beep released."));
    }
  }
}

/**
 * Sets Status LED logical state (handling active-LOW / active-HIGH)
 */
void setStatusLed(bool on) {
  currentLedState = on;
  digitalWrite(PIN_STATUS_LED, on ? STATUS_LED_ACTIVE_LOGIC : (STATUS_LED_ACTIVE_LOGIC == LOW ? HIGH : LOW));
}

/**
 * Non-blocking Status LED pattern engine:
 *   - Fast strobe (100ms) while noise alert/buzzer is active
 *   - Slow warning blink (600ms) when Wi-Fi is disconnected
 *   - Solid ON with gentle heartbeat dip every 3s when online and normal
 */
void updateStatusLed() {
  unsigned long now = millis();

  // Pattern 1: High noise alert / buzzer active -> Rapid strobe
  if (buzzerActive) {
    if (now - lastLedBlinkTime >= 100) {
      lastLedBlinkTime = now;
      setStatusLed(!currentLedState);
    }
    return;
  }

  // Pattern 2: Wi-Fi Disconnected -> Slow warning blink
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastLedBlinkTime >= 600) {
      lastLedBlinkTime = now;
      setStatusLed(!currentLedState);
    }
    return;
  }

  // Pattern 3: Normal Connected State -> Solid ON with gentle 60ms heartbeat dip
  unsigned long cycle = now % 3000;
  if (cycle < 60) {
    setStatusLed(false);
  } else {
    setStatusLed(true);
  }
}

/**
 * Sends seat occupancy heartbeat to POST /api/device/status
 */
void sendStatusUpdate(bool force) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[HTTP] Wi-Fi offline. Skipping cloud status update."));
    return;
  }

  // Visual pulse on Status LED indicating cloud transmission start
  setStatusLed(false);

  WiFiClientSecure client;
  client.setInsecure(); // Do not verify SSL root cert chain on ESP8266 (saves RAM/ROM)
  client.setTimeout(4000);

  HTTPClient http;
  String url = String(USE_HTTPS ? "https://" : "http://") + API_HOST + "/api/device/status";

  if (!http.begin(client, url)) {
    Serial.println(F("[HTTP] Failed to connect to API host"));
    setStatusLed(true);
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  // Construct JSON payload
  // {"device_id":"ESP8266_DEV01","seats":[{"id":"S01","is_occupied":false},...],"firmware_version":"1.0.0","ip_address":"..."}
  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"firmware_version\":\"" + String(FIRMWARE_VER) + "\",";
  payload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"seats\":[";
  for (int i = 0; i < 4; i++) {
    payload += "{\"id\":\"" + String(SEAT_IDS[i]) + "\",\"is_occupied\":" + (seatOccupied[i] ? "true" : "false") + "}";
    if (i < 3) payload += ",";
  }
  payload += "]}";

  Serial.print(F("[HTTP] Sending status update to: "));
  Serial.println(url);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.print(F("[HTTP] Status Response Code: "));
    Serial.println(httpCode);
    if (httpCode == HTTP_CODE_OK || httpCode == 201) {
      String response = http.getString();
      Serial.print(F("[HTTP] Server Response: "));
      Serial.println(response);
    }
  } else {
    Serial.print(F("[HTTP] POST failed, error: "));
    Serial.println(http.errorToString(httpCode).c_str());
  }

  http.end();
  setStatusLed(true);
}

/**
 * Sends acoustic noise event to POST /api/device/noise
 */
void sendNoiseAlert(bool noiseDetected) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[HTTP] Wi-Fi offline. Skipping cloud noise alert."));
    return;
  }

  // Visual pulse on Status LED indicating cloud transmission start
  setStatusLed(false);

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(4000);

  HTTPClient http;
  String url = String(USE_HTTPS ? "https://" : "http://") + API_HOST + "/api/device/noise";

  if (!http.begin(client, url)) {
    Serial.println(F("[HTTP] Failed to connect to API host for noise"));
    setStatusLed(true);
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  String payload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"noise_detected\":" + (noiseDetected ? "true" : "false") + ",\"details\":\"Library acoustic quiet zone threshold breached\"}";

  int httpCode = http.POST(payload);
  Serial.print(F("[HTTP] Noise Alert Response Code: "));
  Serial.println(httpCode);

  http.end();
  setStatusLed(true);
}
