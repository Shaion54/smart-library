# Smart Library Seat Finder — Hardware & Circuit Reference

## 1. Bill of Materials (BOM) & Budget Breakdown

This prototype is engineered for a total university project budget of approximately **BDT 4,000**, using readily available components from local electronics markets (e.g. Dhaka Nawabpur / TechShopBD / DhakaRobotics / Patron Electronics).

| Component | Quantity | Approximate Unit Price (BDT) | Total Cost (BDT) | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| **ESP8266 NodeMCU v2 / v3 (CP2102/CH340)** | 1 | 450 | 450 | Central IoT microcontroller with built-in Wi-Fi |
| **IR Obstacle Sensor Modules (FC-51 / TCRT5000)** | 4 | 70 | 280 | Physical desk seat occupancy detection (S01–S04) |
| **Digital Sound Detection Sensor (LM393 DO)** | 1 | 90 | 90 | Library quiet-zone noise threshold detection |
| **5V Active Buzzer Module (with transistor)** | 1 | 60 | 60 | Audible acoustic warning triggered on noise breach |
| **2N2222 / BC547 NPN Transistor + 1kΩ Resistor** | 1 | 20 | 20 | Buzzer driver stage (if using raw buzzer) |
| **MB-102 Solderless Breadboard (830 points)** | 1 | 180 | 180 | Prototyping bus distribution |
| **5V 2A Micro-USB Power Supply / Adapter** | 1 | 250 | 250 | Reliable power for NodeMCU and 5 sensors |
| **Jumper Wires (M-M, M-F, F-F 40-pin ribbon)** | 1 | 150 | 150 | Wiring sensors to NodeMCU and breadboard |
| **Acrylic / PVC Board & Desk Model Mounting** | 1 | 500 | 500 | Scale 4-desk library model prototype fabrication |
| **Contingency / Miscellaneous hardware** | — | — | 500 | Mounting screws, heat shrink, tape, wire clips |
| **Total Estimated Budget** | | | **~BDT 2,480 - 3,500** | **Well within BDT 4,000 budget!** |

---

## 2. Complete Pin Mapping Table

| Device / Sensor | Sensor Pin | ESP8266 NodeMCU Pin | GPIO | Function / Electrical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Seat 1 IR Sensor** | OUT | **D1** | GPIO5 | Digital Input (PULLUP enabled). Active LOW when person sits. |
| **Seat 2 IR Sensor** | OUT | **D2** | GPIO4 | Digital Input (PULLUP enabled). Active LOW when person sits. |
| **Seat 3 IR Sensor** | OUT | **D5** | GPIO14 | Digital Input (PULLUP enabled). Active LOW when person sits. |
| **Seat 4 IR Sensor** | OUT | **D6** | GPIO12 | Digital Input (PULLUP enabled). Active LOW when person sits. |
| **Sound Sensor (LM393)**| DO | **D7** | GPIO13 | Digital Input. Triggers HIGH when ambient noise breaches threshold. |
| **Active Buzzer Control**| Base / SIG | **D0** | GPIO16 | Digital Output. HIGH pulses transistor base to sound 5V buzzer. |
| **External Status LED** | Anode (+) via 220Ω-330Ω | **D3** | GPIO0 | Digital Output (Active HIGH). Wi-Fi status, HTTP sync pulse, noise strobe. |
| **Power Bus (+)** | VCC | **VU / 5V / 3V3** | — | Micro-USB VU pin provides 5V for buzzer and sensors; see note below. |
| **Common Ground (-)** | GND | **GND** | — | Common reference ground for all sensors, buzzer, and NodeMCU. |

---

## 3. Critical Electrical Precautions & Wiring Rules

> [!CAUTION]
> **ESP8266 Logic Voltage is 3.3V:**
> - NodeMCU GPIOs tolerate a maximum of **3.3V**.
> - Many IR sensors and sound sensors can operate directly from the NodeMCU's **3.3V rail**. Always power the FC-51 IR sensor modules from the NodeMCU **3V3 pin** whenever possible to avoid feeding 5V into the GPIO pins.
> - If operating FC-51 or LM393 from a 5V supply, insert a simple 2-resistor voltage divider (1kΩ and 2kΩ) on the sensor's `OUT` pin before connecting to the NodeMCU GPIO.

> [!IMPORTANT]
> **Buzzer Current Limit:**
> - ESP8266 GPIO pins can source a safe maximum of only **12 mA**.
> - An active buzzer typically draws **25 mA to 45 mA** at 5V. Connecting an active buzzer directly to a NodeMCU GPIO pin will burn out the GPIO!
> - Use an active buzzer module that has an onboard transistor, or wire a discrete 2N2222 / BC547 NPN transistor:
>   - NodeMCU `D0` ➔ 1kΩ base resistor ➔ Base (B) of 2N2222
>   - Emitter (E) of 2N2222 ➔ GND
>   - Collector (C) of 2N2222 ➔ Buzzer (-) negative terminal
>   - Buzzer (+) positive terminal ➔ 5V rail (VU pin)
>   - Place a 1N4148 or 1N4007 flyback diode across the buzzer terminals in reverse (cathode to 5V, anode to collector) to suppress inductive spikes.

> [!TIP]
> **External Status LED Wiring:**
> - NodeMCU **D3 (GPIO0)** ➔ **220Ω বা 330Ω Resistor** ➔ LED-র বড় পা (Anode +)
> - LED-র ছোট পা (Cathode -) ➔ NodeMCU **GND** pin.
> - কোডে লজিক `STATUS_LED_ACTIVE_LOGIC HIGH` কনফিগার করা আছে।

---

## 4. Hardware Calibration Procedure

1. **IR Desk Sensors (FC-51 / TCRT5000):**
   - Each module contains an onboard potentiometer (small blue trimmer with a brass screw).
   - Position each IR module pointing at the seat area (typical detection range: 5 cm to 25 cm).
   - Have someone sit at the desk. Turn the potentiometer until the sensor's onboard `D0_LED` lights up reliably.
   - Have the person stand up; ensure the LED turns off immediately.
2. **Digital Sound Sensor (LM393):**
   - The LM393 module compares the microphone analog level against a reference voltage set by its potentiometer.
   - In a quiet library room, turn the potentiometer until the onboard indicator LED just turns off.
   - Speak or make normal disturbance noise; verify that the LED flashes only during excessive noise.
