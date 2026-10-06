# Smart Library Seat Finder — Low-Budget Academic IoT Prototype

A complete, production-ready, low-budget university IoT system for **real-time library seat occupancy tracking**, **student seat reservation**, and **quiet-zone acoustic noise alerting**.

Built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL, Auth, Realtime)**, and an **ESP8266 NodeMCU** running non-blocking Arduino C++ firmware.

- **Total Prototype Budget:** ~BDT 2,480 – 3,500 (Well within BDT 4,000 budget cap).
- **Zero Paid Server Infrastructure:** Runs on Supabase Free Tier and Vercel Free Tier.
- **Physical vs. Reservation Integrity:** Physical presence (IR sensor) is strictly decoupled from reservations. Overlapping bookings are prevented at the database transaction level using row-locking and partial indexes.

---

## 1. System Architecture & Features

```
+-------------------------------------------------------------+
|                  PHYSICAL HARDWARE LAYER                    |
|  [IR Seat 1: D1]  [IR Seat 2: D2]  [IR Seat 3: D5]  [IR 4: D6] |
|  [LM393 Sound DO: D7] ---------> [Active Buzzer: D0] (Local)|
|                               |                             |
|                    ESP8266 NodeMCU Unit                     |
+------------------------------+------------------------------+
                               | HTTPS POST (Heartbeat & Alerts)
                               v
+-------------------------------------------------------------+
|                     NEXT.JS ROUTE HANDLERS                  |
|  POST /api/device/status  <-- Token Auth + Rate Limiting    |
|  POST /api/device/noise   <-- Noise Breach & Logging        |
|  GET/POST /api/reservations <-- Concurrency-Safe Booking     |
|  PATCH /api/reservations/[id] <-- Student / Admin Cancel    |
|  PATCH /api/seats/[id]    <-- Maintenance Toggle            |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                   SUPABASE DATABASE & AUTH                  |
|  PostgreSQL (Row Level Security, Atomic Stored Procedure)   |
|  Realtime WebSocket Broadcasts (seats, devices, bookings)   |
+-------------------------------------------------------------+
```

### Core Features
- **Live Seat Occupancy (S01–S04):** Displays physical presence vs booking state.
- **Student Dashboard:** One-click reservation (30 min default), live countdown timer, and self-cancellation.
- **Admin Control Center:** System statistics, seat maintenance mode toggle, master reservation cancellation, and device health monitoring.
- **Quiet Zone Noise Alert:** Sound sensor detects noise spikes, sounds the local physical buzzer on the ESP8266, and flags a visible warning on web dashboards.
- **Offline Device Detection:** If the ESP8266 stops transmitting beyond 60s, seats display as `Offline / Unknown` rather than deceptively appearing as `Available`.
- **Atomic Concurrency Control:** Row-level locks (`SELECT ... FOR UPDATE`) in `create_reservation()` prevent double-bookings.

---

## 2. Hardware Bill of Materials (BOM) & Bangladesh Cost Breakdown

| Component | Quantity | Est. Unit Price (BDT) | Total Cost (BDT) | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| **ESP8266 NodeMCU v2 / v3** | 1 | 450 | 450 | Central IoT unit with Wi-Fi |
| **FC-51 / TCRT5000 IR Sensors** | 4 | 70 | 280 | Seat occupancy detection (S01–S04) |
| **LM393 Digital Sound Sensor** | 1 | 90 | 90 | Quiet zone noise threshold detection |
| **5V Active Buzzer Module** | 1 | 60 | 60 | Local acoustic warning alert |
| **2N2222 Transistor + 1kΩ Resistor** | 1 | 20 | 20 | Buzzer current amplifier stage |
| **MB-102 Breadboard + Jumper Wires** | 1 | 330 | 330 | Prototyping and wiring harness |
| **5V 2A USB Power Adapter** | 1 | 250 | 250 | System power supply |
| **Desk Model Board Fabrication** | 1 | 500 | 500 | Academic 4-seat physical mock layout |
| **Contingency / Mounting Hardware** | — | — | 500 | Clips, heat shrink, tape |
| **Total Prototype Cost** | | | **~BDT 2,480 - 2,980** | **Academic Budget: BDT 4,000** |

---

## 3. Step-by-Step Deployment Guide

### Step 1: Install Dependencies
Ensure Node.js 18+ is installed:
```bash
git clone <your-repo-url>
cd "Smart Library"
npm install
```

### Step 2: Create a Free Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a free project (e.g., `smart-library-iot`).
2. Once provisioned, navigate to **Project Settings** ➔ **API**.
3. Note the following credentials:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon / public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`)

### Step 3: Apply the Database Schema
1. In the Supabase Dashboard, open the **SQL Editor**.
2. Open the file [`supabase/schema.sql`](supabase/schema.sql) from this repository.
3. Paste its entire contents into the SQL Editor and click **Run**.
4. This will create:
   - Tables: `profiles`, `seats`, `reservations`, `devices`, `noise_logs`.
   - Initial seat records: `S01`, `S02`, `S03`, `S04`.
   - Initial device record: `ESP8266_DEV01`.
   - Concurrency-safe atomic booking function: `create_reservation()`.
   - Auto-expiry cleanup function: `expire_stale_reservations()`.
   - Realtime publication on `seats`, `devices`, and `reservations`.
   - Comprehensive Row Level Security (RLS) policies.

### Step 4: Configure Authentication and Admin Setup
1. In Supabase Dashboard, navigate to **Authentication** ➔ **Providers** ➔ **Email** and ensure Email provider is enabled.
2. (Optional) Under **Authentication** ➔ **URL Configuration**, add your local URL (`http://localhost:3000`) and Vercel URL.
3. **Register your Admin User:**
   - Run the app or visit `/login` and create an account (e.g. `admin@library.edu`).
   - By default, all public signups are assigned the `student` role.
   - Go to Supabase **Table Editor** ➔ `profiles` table.
   - Find your row and change `role` from `student` to `admin`.
   - Save. Your account now has full administrator privileges!

### Step 5: Configure Environment Variables
Create a `.env.local` file in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEVICE_API_TOKEN=generate-a-strong-random-token-here-123456
NEXT_PUBLIC_DEFAULT_RESERVATION_MINUTES=30
DEVICE_OFFLINE_TIMEOUT_SECONDS=60
```

### Step 6: Deploy to Vercel
1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
3. Import this repository.
4. Add the environment variables configured in Step 5:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DEVICE_API_TOKEN`
5. Click **Deploy**. Vercel will build and assign a production URL (e.g. `https://smart-library-seat-finder.vercel.app`).

### Step 7: Configure and Upload ESP8266 Firmware
1. Open the Arduino IDE.
2. Install the **ESP8266 Board Package**:
   - Go to **File** ➔ **Preferences**.
   - Add to *Additional Boards Manager URLs*:
     `http://arduino.esp8266.com/stable/package_esp8266com_index.json`
   - Open **Tools** ➔ **Board** ➔ **Boards Manager**, search for `esp8266`, and install it.
3. Open [`firmware/smart_library_esp8266.ino`](firmware/smart_library_esp8266.ino).
4. Create a copy of [`firmware/config.h.example`](firmware/config.h.example) named `config.h` inside the `firmware/` directory and configure:
   ```cpp
   #define WIFI_SSID       "Your_Library_WiFi"
   #define WIFI_PASSWORD   "Your_WiFi_Password"
   #define API_HOST        "smart-library-seat-finder.vercel.app" // Your Vercel domain (without https://)
   #define DEVICE_TOKEN    "generate-a-strong-random-token-here-123456" // Must match DEVICE_API_TOKEN
   ```
5. Connect your NodeMCU to your computer via micro-USB.
6. Select **Tools** ➔ **Board** ➔ **NodeMCU 1.0 (ESP-12E Module)** and select your COM Port.
7. Click **Upload**.

---

## 4. Hardware Wiring Reference

Refer to [`firmware/circuit_diagram.md`](firmware/circuit_diagram.md) for full schematic details.

| NodeMCU Pin | GPIO | Connected To | Notes |
| :--- | :--- | :--- | :--- |
| **D1** | GPIO5 | Seat 1 IR Sensor OUT | Active LOW when occupied |
| **D2** | GPIO4 | Seat 2 IR Sensor OUT | Active LOW when occupied |
| **D5** | GPIO14 | Seat 3 IR Sensor OUT | Active LOW when occupied |
| **D6** | GPIO12 | Seat 4 IR Sensor OUT | Active LOW when occupied |
| **D7** | GPIO13 | Sound Sensor DO | Triggers HIGH on noise breach |
| **D0** | GPIO16 | Buzzer Transistor Base | Drives 2N2222 base via 1kΩ resistor |
| **3V3** | 3.3V | VCC of IR Sensors & Sound Sensor | Safe 3.3V power |
| **GND** | 0V | Common Ground | Connected to all sensor GND pins |

---

## 5. Testing & Verification

1. **Local Logic & Schema Tests:**
   Run the automated test validation suite:
   ```bash
   node scripts/test-validation.mjs
   ```
   Ensures all schemas, concurrency logic, and timeout calculations pass.

2. **Simulating Device Updates (Without Hardware):**
   You can test cloud API ingestion using `curl`:
   ```bash
   # Test seat occupancy update
   curl -X POST https://your-deployment.vercel.app/api/device/status \
     -H "Content-Type: application/json" \
     -H "x-device-token: your-device-token" \
     -d '{
       "device_id": "ESP8266_DEV01",
       "seats": [
         {"id": "S01", "is_occupied": true},
         {"id": "S02", "is_occupied": false},
         {"id": "S03", "is_occupied": false},
         {"id": "S04", "is_occupied": false}
       ]
     }'

   # Test acoustic noise spike alert
   curl -X POST https://your-deployment.vercel.app/api/device/noise \
     -H "Content-Type: application/json" \
     -H "x-device-token: your-device-token" \
     -d '{
       "device_id": "ESP8266_DEV01",
       "noise_detected": true,
       "details": "Loud conversation detected in study area"
     }'
   ```

3. **Student Reservation Verification:**
   - Log in as a student at `/login`.
   - Visit `/dashboard`. Click **Reserve Seat (30 min)** on an available seat.
   - Verify that the card status turns **Reserved** and the active reservation countdown appears.
   - Attempt to book a second seat; verify that the atomic check prevents multi-seat booking.
   - Click **Cancel Reservation**; verify that the seat reverts to **Available**.

4. **Admin Oversight Verification:**
   - Log in with the administrator account and navigate to `/admin`.
   - Verify breakdown statistics (Total, Available, Occupied, Reserved, Maintenance).
   - Click **Place in Maintenance** on `S04`; verify that student reservations are disabled on `S04`.
   - Review live ESP8266 heartbeat status and the full reservations audit log.

---

## 6. Troubleshooting Common Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **ESP8266 Serial shows `[HTTP] POST failed, error: connection refused`** | Wrong `API_HOST` or port | Set `API_HOST` to your Vercel hostname without `https://` prefix (e.g. `myapp.vercel.app`). Ensure `USE_HTTPS` is set to `true`. |
| **Seat status displays "Offline / Unknown"** | No heartbeat received in > 60s | Power on the ESP8266 and check Wi-Fi connection in Serial Monitor (115200 baud). |
| **IR Sensor LED stays on constantly** | Potentiometer sensitivity too high | Use a small flathead screwdriver to turn the blue trimmer on the FC-51 module counter-clockwise until it only triggers when an obstacle is within 15 cm. |
| **Buzzer does not sound during noise trigger** | Buzzer current exceeds GPIO limit | Ensure the buzzer is driven through a 2N2222 NPN transistor or active module with built-in driver. |
| **Student cannot access `/admin` page** | Default role is `student` | In Supabase Dashboard, open `profiles` table and set `role` to `'admin'` for that user. |
| **Double bookings or race condition** | Concurrency test | `schema.sql` uses `SELECT ... FOR UPDATE` row-locking in `create_reservation()` and partial index `idx_unique_active_seat_reservation`. |

---

## 7. License
Educational & University Academic Use — MIT License.
