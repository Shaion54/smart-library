/**
 * ==============================================================================
 * Smart Library Seat Finder - ESP8266 NodeMCU Firmware
 * Academic IoT Prototype (~BDT 4,000 Budget)
 * 
 * Hardware:
 *   - ESP8266 NodeMCU v2 / v3
 *   - 4x IR Obstacle Sensors (TCRT5000 / FC-51) on D1, D2, D5, D6
 *   - 1x Digital Sound Detection Module (LM393) on D7
 *   - 1x Active 5V Buzzer on D0
 *   - 1x External Status LED on D3 (Anode via resistor to D3, Cathode to GND)
 * ==============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>
#include <Ticker.h>
#include <EEPROM.h>

// ==============================================================================
// 1. Wi-Fi & Backend API Configuration (UPDATE THESE BEFORE UPLOADING)
// ==============================================================================
#define WIFI_SSID               "Loding......."
#define WIFI_PASSWORD           "1234@4321.L"

// --- Choose Deployment Target: Vercel Cloud vs Local PC ---
// Set USE_VERCEL_DEPLOYMENT to true for Vercel Cloud hosting.
// Set USE_VERCEL_DEPLOYMENT to false for Local PC testing.
#define USE_VERCEL_DEPLOYMENT   true

#if USE_VERCEL_DEPLOYMENT
  // Replace with your Vercel deployment domain (without http:// or https://)
  // Example: "smart-library.vercel.app"
  #define API_HOST              "your-project.vercel.app"
  #define API_PORT              443
  #define USE_HTTPS             true
#else
  #define API_HOST              "192.168.0.241"  // Local Server IP (Next.js PC)
  #define API_PORT              3000             // Local Port (3000)
  #define USE_HTTPS             false            // Local HTTP testing
#endif

#define DEVICE_ID               "ESP8266_DEV01"
#define DEVICE_TOKEN            "library_device_secret_token_12345"
#define FIRMWARE_VER            "1.3.0"

// ==============================================================================
// 2. Hardware Pin Assignments (NodeMCU ESP8266)
// ==============================================================================
#define PIN_SEAT_1              D1  // GPIO5  - Seat 1 IR Sensor DO
#define PIN_SEAT_2              D2  // GPIO4  - Seat 2 IR Sensor DO
#define PIN_SEAT_3              D5  // GPIO14 - Seat 3 IR Sensor DO
#define PIN_SEAT_4              D6  // GPIO12 - Seat 4 IR Sensor DO
#define PIN_SOUND_DO            D7  // GPIO13 - Sound Sensor DO (Hardware Interrupt)
#define PIN_BUZZER              D0  // GPIO16 - Buzzer Module (Connected to D0)
#define PIN_STATUS_LED          D3  // GPIO0  - External Status LED (Anode via resistor to D3, Cathode to GND)

// ==============================================================================
// 3. Logic Levels & Calibration
// ==============================================================================
#define STATUS_LED_ACTIVE_LOGIC HIGH // HIGH turns ON external LED connected to GND
#define IR_OCCUPIED_LOGIC       LOW  // TCRT5000 / FC-51 outputs LOW when object is detected
#define SOUND_TRIGGER_LOGIC     LOW  // LM393 DO goes LOW upon sound threshold breach (Active-LOW comparator)
#define BUZZER_ACTIVE_LOGIC     HIGH // Active-HIGH buzzer driver (Set to LOW if your buzzer module is active-LOW)

#define HEARTBEAT_INTERVAL_MS   1000 // Send data to server every 1 second
#define DEBOUNCE_TIME_MS        300  // Fast 300ms seat IR debounce
#define BUZZER_PULSE_CYCLE_MS   140  // Rapid bip.bip.bip cycle (70ms ON, 70ms OFF)
#define NOISE_QUIET_RESET_MS    2000 // 2 seconds of quiet needed to stop alert and reset

// EEPROM Storage Configuration (Stores Threshold Locally on ESP8266)
#define EEPROM_SIZE             64
#define EEPROM_MAGIC            0xC9
#define EEPROM_ADDR_MAGIC       0
#define EEPROM_ADDR_THRESHOLD   1

// Pin array for seats
const uint8_t SEAT_PINS[4] = { PIN_SEAT_1, PIN_SEAT_2, PIN_SEAT_3, PIN_SEAT_4 };
const char* SEAT_IDS[4]   = { "S01", "S02", "S03", "S04" };

// Debounced Seat States
bool seatOccupied[4]          = { false, false, false, false };
bool lastRawReading[4]        = { false, false, false, false };
unsigned long lastDebounce[4] = { 0, 0, 0, 0 };

// Buzzer & Sound State (Continuous alert while noise persists)
int currentThresholdDb        = 30;    // Configured limit (stored in EEPROM, dynamically synced from dashboard)
volatile bool noiseAlertActive = false; // True as long as sound breaches threshold
bool dashboardAlertActive     = false; // Persists when dashboard triggers an alert
unsigned long lastSoundBreachTime = 0; // Timestamp of latest sound detected above threshold
unsigned long lastNoiseCloudSend  = 0; // Throttle cloud updates while noise is continuous
bool pendingCloudNoiseSend    = false; // Non-blocking flag for background cloud update
bool pendingCloudNoiseClear   = false;

// Hardware Interrupt for Sound Sensor (Catches microsecond sound spikes instantly)
volatile bool soundInterruptFired = false;
volatile unsigned long lastSoundInterruptTime = 0;

ICACHE_RAM_ATTR void soundISR() {
  soundInterruptFired = true;
  lastSoundInterruptTime = millis();
}

// Ticker-Driven Hardware Timer for Buzzer (Zero freeze / jitter during Wi-Fi or HTTP)
Ticker buzzerTicker;
volatile bool buzzerPulseState = false;

void ICACHE_RAM_ATTR buzzerPulseISR() {
  if (noiseAlertActive) {
    buzzerPulseState = !buzzerPulseState;
    // Rapid bip.bip.bip: 70ms ON / 70ms OFF
    digitalWrite(PIN_BUZZER, buzzerPulseState ? ((BUZZER_ACTIVE_LOGIC == HIGH) ? HIGH : LOW) : ((BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH));
    digitalWrite(PIN_STATUS_LED, buzzerPulseState ? STATUS_LED_ACTIVE_LOGIC : (STATUS_LED_ACTIVE_LOGIC == LOW ? HIGH : LOW));
  } else {
    buzzerPulseState = false;
    digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
  }
}

// Secondary fail-safe buzzer driver in main loop
unsigned long lastBuzzerLoopToggle = 0;
void updateBuzzerState() {
  if (noiseAlertActive) {
    unsigned long now = millis();
    if (now - lastBuzzerLoopToggle >= (BUZZER_PULSE_CYCLE_MS / 2)) {
      lastBuzzerLoopToggle = now;
      buzzerPulseState = !buzzerPulseState;
      digitalWrite(PIN_BUZZER, buzzerPulseState ? ((BUZZER_ACTIVE_LOGIC == HIGH) ? HIGH : LOW) : ((BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH));
      digitalWrite(PIN_STATUS_LED, buzzerPulseState ? STATUS_LED_ACTIVE_LOGIC : (STATUS_LED_ACTIVE_LOGIC == LOW ? HIGH : LOW));
    }
  } else {
    if (buzzerPulseState) {
      buzzerPulseState = false;
      digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
    }
  }
}

// Status LED State & Timing
unsigned long lastLedBlinkTime = 0;
bool currentLedState           = false;

// Timing State
unsigned long lastHeartbeatTime = 0;
unsigned long lastWiFiCheckTime = 0;
bool wasWiFiConnected          = false; // Tracks instant Wi-Fi connect/disconnect transitions

// Local Web Server on Port 80 for Instant LAN Triggering
ESP8266WebServer localServer(80);

// Function Prototypes
void loadStoredThreshold();
void saveThresholdToEEPROM(int newTh);
void connectWiFi();
void checkWiFiConnection();
void sampleSensors();
void updateStatusLed();
void setStatusLed(bool on);
void triggerBeaconStrobe();
void sendStatusUpdate(bool force);
void sendNoiseAlert(bool noiseDetected, int soundDb);
void setupWebServer();

// ==============================================================================
// EEPROM Persistence Functions (Hardware Stores Threshold Locally)
// ==============================================================================
void loadStoredThreshold() {
  EEPROM.begin(EEPROM_SIZE);
  uint8_t magic = EEPROM.read(EEPROM_ADDR_MAGIC);
  if (magic == EEPROM_MAGIC) {
    uint8_t stored = EEPROM.read(EEPROM_ADDR_THRESHOLD);
    if (stored >= 20 && stored <= 100) {
      currentThresholdDb = (int)stored;
      Serial.print(F("[EEPROM] Loaded stored noise threshold: "));
      Serial.print(currentThresholdDb);
      Serial.println(F(" dB (Ready before Wi-Fi)"));
      return;
    }
  }
  // If not previously initialized, write default 30 dB
  saveThresholdToEEPROM(currentThresholdDb);
}

void saveThresholdToEEPROM(int newTh) {
  if (newTh < 20 || newTh > 100) return;
  EEPROM.write(EEPROM_ADDR_MAGIC, EEPROM_MAGIC);
  EEPROM.write(EEPROM_ADDR_THRESHOLD, (uint8_t)newTh);
  EEPROM.commit();
  Serial.print(F("[EEPROM] Saved noise threshold to internal flash: "));
  Serial.print(newTh);
  Serial.println(F(" dB"));
}

// ==============================================================================
// LOCAL LAN HTTP WEBSERVER (Sub-millisecond direct alert trigger)
// ==============================================================================
void setupWebServer() {
  // /alert?state=on OR /alert?state=off
  localServer.on("/alert", HTTP_ANY, []() {
    String state = localServer.arg("state");
    if (state == "on" || state == "1" || state == "true") {
      dashboardAlertActive = true;
      noiseAlertActive = true;
      lastSoundBreachTime = millis();
      localServer.send(200, "application/json", "{\"status\":\"alert_active\",\"buzzer\":true}");
      Serial.println(F("[LAN HTTP] Direct Alert ON command received -> Buzzer sounding!"));
    } else {
      dashboardAlertActive = false;
      noiseAlertActive = false;
      digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
      setStatusLed(false);
      localServer.send(200, "application/json", "{\"status\":\"alert_cleared\",\"buzzer\":false}");
      Serial.println(F("[LAN HTTP] Direct Alert OFF command received -> Buzzer silenced!"));
    }
  });

  // /threshold?val=20
  localServer.on("/threshold", HTTP_ANY, []() {
    if (localServer.hasArg("val")) {
      int newTh = localServer.arg("val").toInt();
      if (newTh >= 20 && newTh <= 100) {
        currentThresholdDb = newTh;
        saveThresholdToEEPROM(currentThresholdDb);
        localServer.send(200, "application/json", "{\"status\":\"ok\",\"threshold\":" + String(currentThresholdDb) + "}");
        Serial.print(F("[LAN HTTP] Noise threshold updated via LAN to: "));
        Serial.print(currentThresholdDb);
        Serial.println(F(" dB"));
        return;
      }
    }
    localServer.send(400, "application/json", "{\"error\":\"invalid_threshold\"}");
  });

  // /status
  localServer.on("/status", HTTP_GET, []() {
    String json = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"alert\":" + (noiseAlertActive ? "true" : "false") + ",\"threshold\":" + String(currentThresholdDb) + "}";
    localServer.send(200, "application/json", json);
  });

  localServer.begin();
  Serial.println(F("[Setup] Local LAN WebServer started on port 80."));
}

// ==============================================================================
// SETUP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("=================================================="));
  Serial.println(F(" Smart Library Seat Finder - ESP8266 Firmware v1.2"));
  Serial.println(F(" Instant Local Alert Engine (Hardware-First Priority)"));
  Serial.println(F("=================================================="));

  // 1. Load Stored Noise Threshold from EEPROM (Zero network reliance)
  loadStoredThreshold();

  // 2. Initialize Status LED Pin & Startup Test (LED lights up for 1s on boot)
  pinMode(PIN_STATUS_LED, OUTPUT);
  setStatusLed(true);
  delay(1000);
  setStatusLed(false);

  // 3. Initialize Buzzer Pin & Startup Hardware Test (2 fast bip.bip pulses with LED)
  pinMode(PIN_BUZZER, OUTPUT);
  for (int b = 0; b < 2; b++) {
    digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? HIGH : LOW);
    setStatusLed(true);
    delay(70);
    digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
    setStatusLed(false);
    delay(70);
  }

  // 4. Attach Hardware Timer Ticker for Buzzer (70ms oscillation)
  buzzerTicker.attach_ms(BUZZER_PULSE_CYCLE_MS / 2, buzzerPulseISR);

  // 5. Initialize Seat IR Sensor Pins
  for (int i = 0; i < 4; i++) {
    pinMode(SEAT_PINS[i], INPUT_PULLUP);
    bool initialRead = (digitalRead(SEAT_PINS[i]) == IR_OCCUPIED_LOGIC);
    seatOccupied[i] = initialRead;
    lastRawReading[i] = initialRead;
  }

  // 6. Initialize Digital Sound Sensor DO Pin with hardware interrupt on pin D7 (GPIO13)
  pinMode(PIN_SOUND_DO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_SOUND_DO), soundISR, CHANGE);
  Serial.println(F("[Setup] Sound sensor interrupt attached to pin D7 (Instant trigger enabled)."));

  // 7. Connect to Wi-Fi asynchronously in background
  connectWiFi();

  // 8. Start Local Web Server for LAN direct trigger
  setupWebServer();

  // 9. Send initial startup status
  sendStatusUpdate(true);
}

// ==============================================================================
// MAIN LOOP
// ==============================================================================
void loop() {
  unsigned long now = millis();

  // 1. Handle incoming direct LAN HTTP requests
  localServer.handleClient();

  // 2. Maintain Wi-Fi connectivity and detect immediate connection transition
  bool isConnected = (WiFi.status() == WL_CONNECTED);
  if (isConnected && !wasWiFiConnected) {
    wasWiFiConnected = true;
    Serial.print(F("[WiFi] Online! IP: "));
    Serial.println(WiFi.localIP());
    triggerBeaconStrobe();
    // IMMEDIATELY notify web dashboard that hardware is ONLINE!
    sendStatusUpdate(true);
  } else if (!isConnected && wasWiFiConnected) {
    wasWiFiConnected = false;
    Serial.println(F("[WiFi] Hardware disconnected from Wi-Fi."));
  }

  if (!isConnected && (now - lastWiFiCheckTime > 3000)) {
    lastWiFiCheckTime = now;
    checkWiFiConnection();
  }

  // 3. High-speed local sensor sampling (Hardware Priority - Instant Alert Trigger)
  sampleSensors();

  // 4. Fail-safe buzzer oscillation
  updateBuzzerState();

  // 5. Update Status LED patterns (Wi-Fi beacon strobe & disconnect warnings)
  updateStatusLed();

  // 6. Asynchronous Cloud Alert Dispatch (Sends after buzzer is already beeping, never blocks sound)
  if (pendingCloudNoiseSend && (now - lastNoiseCloudSend >= 150)) {
    pendingCloudNoiseSend = false;
    if (WiFi.status() == WL_CONNECTED) {
      sendNoiseAlert(true, max(currentThresholdDb + 15, 65));
    }
  } else if (pendingCloudNoiseClear) {
    pendingCloudNoiseClear = false;
    if (WiFi.status() == WL_CONNECTED) {
      sendNoiseAlert(false, 24);
    }
  }

  // 7. Send periodic heartbeat / occupancy status to Next.js API
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendStatusUpdate(false);
  }

  // Yield to ESP8266 background Wi-Fi and watchdog stack
  yield();
}

/**
 * Connects to the configured Wi-Fi network with visual LED indicator
 */
void connectWiFi() {
  Serial.print(F("[WiFi] Connecting to: "));
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 6000) {
    setStatusLed(!currentLedState);
    delay(100);
    Serial.print(F("."));
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wasWiFiConnected = true;
    Serial.print(F("[WiFi] Connected! IP Address: "));
    Serial.println(WiFi.localIP());
    triggerBeaconStrobe();
    sendStatusUpdate(true);
  } else {
    wasWiFiConnected = false;
    setStatusLed(false);
    Serial.println(F("[WiFi] Connecting in background."));
  }
}

/**
 * Checks and non-blockingly reconnects Wi-Fi if connection was lost
 */
void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    wasWiFiConnected = false;
    Serial.println(F("[WiFi] Reconnecting..."));
    WiFi.reconnect();
  } else if (!wasWiFiConnected) {
    wasWiFiConnected = true;
    Serial.println(F("[WiFi] Reconnected! Sending immediate heartbeat to web..."));
    triggerBeaconStrobe();
    sendStatusUpdate(true);
  }
}

/**
 * Samples physical IR sensors and digital sound sensor with zero latency
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

  // --- B. Sound Sensor Processing (INSTANT LOCAL ALERT - NO NETWORK WAIT) ---
  bool rawPin = digitalRead(PIN_SOUND_DO);
  bool soundPulse = soundInterruptFired || (rawPin == SOUND_TRIGGER_LOGIC);
  if (soundInterruptFired) {
    soundInterruptFired = false; // Reset interrupt latch
  }

  // Realistic Decibel Estimation:
  // LM393 DO pin triggers on acoustic breach.
  // When sound pulse detected: elevated spike 75-78 dB.
  // When tranquil & quiet: calm ambient 25 dB.
  int estimatedDb = soundPulse ? max(currentThresholdDb + 15, 75) : 25;

  // Breach Condition:
  // 1. Real sound detected by LM393 (soundPulse)
  // 2. OR threshold set below quiet ambient level (e.g. threshold set to 20 dB while quiet is 25 dB)
  // 3. OR dashboard simulated test active
  bool isBreaching = soundPulse || (25 >= currentThresholdDb) || dashboardAlertActive;

  if (isBreaching) {
    lastSoundBreachTime = now;

    // IMMEDIATE LOCAL HARDWARE ALERT! (NO NETWORK WAITING)
    if (!noiseAlertActive) {
      noiseAlertActive = true; // Hardware ticker & loop driver immediately start bip.bip.bip pulses!
      Serial.print(F("[Noise] Breach detected! Level: "));
      Serial.print(estimatedDb);
      Serial.print(F(" dB (Threshold: "));
      Serial.print(currentThresholdDb);
      Serial.println(F(" dB) -> BUZZER ALERTING IMMEDIATELY!"));

      // Schedule background cloud update (never blocks the buzzer!)
      pendingCloudNoiseSend = true;
      lastNoiseCloudSend = now;
    }
  } else {
    // Sound is currently below threshold:
    // If noise has ceased for 1.2s, stop buzzer immediately and restore sanctuary!
    if (noiseAlertActive && (now - lastSoundBreachTime >= 1200)) {
      noiseAlertActive = false;
      dashboardAlertActive = false;
      digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
      setStatusLed(false);
      Serial.println(F("[Noise] Sanctuary restored tranquil quiet. Buzzer stopped."));
      pendingCloudNoiseClear = true;
    }
  }
}

/**
 * Sets Status LED logical state (handling active-LOW / active-HIGH)
 */
void setStatusLed(bool on) {
  if (noiseAlertActive) return; // Do not disturb active buzzer/LED alarm
  currentLedState = on;
  digitalWrite(PIN_STATUS_LED, on ? STATUS_LED_ACTIVE_LOGIC : (STATUS_LED_ACTIVE_LOGIC == LOW ? HIGH : LOW));
}

/**
 * Airplane Beacon Strobe:
 * Generates two ultra-fast, sharp flashes like an aircraft anti-collision strobe (Flash 35ms - Pause 45ms - Flash 35ms)
 */
void triggerBeaconStrobe() {
  if (noiseAlertActive) return; // Never interrupt active alarm
  setStatusLed(true);
  delay(35);
  setStatusLed(false);
  delay(45);
  setStatusLed(true);
  delay(35);
  setStatusLed(false);
}

/**
 * Status LED Pattern Engine:
 *   - Continuous Alert Active: Handled by buzzerPulseISR() & updateBuzzerState()
 *   - Wi-Fi Disconnected: Fast continuous blink (120ms toggle)
 *   - Wi-Fi Connected: Normally idle OFF.
 */
void updateStatusLed() {
  if (noiseAlertActive) return; // Handled by buzzer alarm

  unsigned long now = millis();

  // Pattern: Wi-Fi Disconnected -> Fast warning blink (120ms)
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastLedBlinkTime >= 120) {
      lastLedBlinkTime = now;
      setStatusLed(!currentLedState);
    }
    return;
  }

  // Normal Connected State -> Idle OFF
  if (currentLedState) {
    setStatusLed(false);
  }
}

/**
 * Helper to build clean full endpoint URL
 */
String buildApiUrl(const String& path) {
  String host = String(API_HOST);
  host.trim();
  String url = "";
  if (host.startsWith("http://") || host.startsWith("https://")) {
    url = host;
  } else {
    url = String(USE_HTTPS ? "https://" : "http://") + host;
    if (API_PORT != 80 && API_PORT != 443 && !host.endsWith(String(":") + String(API_PORT))) {
      url += ":" + String(API_PORT);
    }
  }
  if (url.endsWith("/")) {
    url.remove(url.length() - 1);
  }
  return url + path;
}

/**
 * Sends seat occupancy heartbeat to POST /api/device/status
 */
void sendStatusUpdate(bool force) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  String url = buildApiUrl("/api/device/status");

  HTTPClient http;
  bool beginOk = false;

  WiFiClientSecure secureClient;
  WiFiClient regularClient;

  regularClient.setTimeout(2500);

  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    secureClient.setTimeout(2500);
    beginOk = http.begin(secureClient, url);
  } else {
    beginOk = http.begin(regularClient, url);
  }

  if (!beginOk) {
    return;
  }

  http.setTimeout(2500);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  // Construct JSON payload
  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"firmware_version\":\"" + String(FIRMWARE_VER) + "\",";
  payload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"noise_detected\":" + String(noiseAlertActive ? "true" : "false") + ",";
  payload += "\"seats\":[";
  for (int i = 0; i < 4; i++) {
    payload += "{\"id\":\"" + String(SEAT_IDS[i]) + "\",\"is_occupied\":" + (seatOccupied[i] ? "true" : "false") + "}";
    if (i < 3) payload += ",";
  }
  payload += "]}";

  int httpCode = http.POST(payload);

  if (httpCode == HTTP_CODE_OK || httpCode == 201) {
    if (!noiseAlertActive) {
      triggerBeaconStrobe();
    }

    String response = http.getString();

    // 1. Dynamic noise threshold sync from dashboard -> Saved to EEPROM!
    // Robust extraction: locate key, find subsequent colon ':', and parse integer
    int thIdx = response.indexOf("noise_threshold_db");
    if (thIdx != -1) {
      int colonIdx = response.indexOf(':', thIdx);
      if (colonIdx != -1) {
        int parsedThreshold = response.substring(colonIdx + 1).toInt();
        if (parsedThreshold >= 20 && parsedThreshold <= 100 && parsedThreshold != currentThresholdDb) {
          currentThresholdDb = parsedThreshold;
          saveThresholdToEEPROM(currentThresholdDb); // Store locally in EEPROM flash
          Serial.print(F("[Config] Synced noise threshold from dashboard: "));
          Serial.print(currentThresholdDb);
          Serial.println(F(" dB (Saved to EEPROM)"));
        }
      }
    }

    // 2. Sync warning flag from dashboard
    int warnIdx = response.indexOf("noise_warning_active");
    if (warnIdx != -1) {
      String sub = response.substring(warnIdx, warnIdx + 35);
      if (sub.indexOf("true") != -1) {
        dashboardAlertActive = true;
        if (!noiseAlertActive) {
          noiseAlertActive = true;
          lastSoundBreachTime = millis();
          Serial.println(F("[Noise] Dashboard signaled ACTIVE warning! Buzzer sounding!"));
        }
      } else if (sub.indexOf("false") != -1) {
        if (dashboardAlertActive || noiseAlertActive) {
          dashboardAlertActive = false;
          noiseAlertActive = false;
          digitalWrite(PIN_BUZZER, (BUZZER_ACTIVE_LOGIC == HIGH) ? LOW : HIGH);
          setStatusLed(false);
          Serial.println(F("[Noise] Dashboard signaled tranquil sanctuary. Alert stopped immediately!"));
        }
      }
    }
  }

  http.end();
}

/**
 * Sends acoustic noise event to POST /api/device/noise (Asynchronous / Non-blocking)
 */
void sendNoiseAlert(bool noiseDetected, int soundDb) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  String url = buildApiUrl("/api/device/noise");

  HTTPClient http;
  bool beginOk = false;

  WiFiClientSecure secureClient;
  WiFiClient regularClient;

  regularClient.setTimeout(2500);

  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    secureClient.setTimeout(2500);
    beginOk = http.begin(secureClient, url);
  } else {
    beginOk = http.begin(regularClient, url);
  }

  if (!beginOk) {
    return;
  }

  http.setTimeout(2500);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  String payload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"noise_detected\":" + (noiseDetected ? "true" : "false") + ",\"sound_level_db\":" + String(soundDb) + ",\"details\":\"" + (noiseDetected ? "Autonomous acoustic breach detected on ESP8266" : "Acoustic level normalized below quiet limit") + "\"}";

  http.POST(payload);
  http.end();
}
