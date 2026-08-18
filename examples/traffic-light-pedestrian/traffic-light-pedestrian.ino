/*
  Traffic Light & Pedestrian Crossing — State Machine + LCD1602 + Buzzer
  - Car lights: Red (D12), Yellow (D11), Green (D10)
  - Pedestrian lights: Red (D7), Green (D6)
  - Crosswalk request pushbutton: D2 (INPUT_PULLUP)
  - Accessible buzzer: D8
  - LCD1602 I2C (0x27): SDA -> A4, SCL -> A5
*/
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define PIN_CAR_R 12
#define PIN_CAR_Y 11
#define PIN_CAR_G 10
#define PIN_PED_R 7
#define PIN_PED_G 6
#define PIN_BTN   2
#define PIN_BUZZ  8

enum TrafficState : uint8_t {
  ST_CAR_GREEN = 0,
  ST_CAR_YELLOW,
  ST_ALL_RED,
  ST_PED_WALK,
  ST_PED_BLINK
};

LiquidCrystal_I2C lcd(0x27, 16, 2);

TrafficState state = ST_CAR_GREEN;
bool pedRequested = false;
uint32_t stateEnteredMs = 0;
uint32_t lastLcdMs = 0;
uint32_t lastBlinkMs = 0;
bool blinkOn = true;
int8_t lastShownSec = -1;

void setLights(bool cr, bool cy, bool cg, bool pr, bool pg) {
  digitalWrite(PIN_CAR_R, cr ? HIGH : LOW);
  digitalWrite(PIN_CAR_Y, cy ? HIGH : LOW);
  digitalWrite(PIN_CAR_G, cg ? HIGH : LOW);
  digitalWrite(PIN_PED_R, pr ? HIGH : LOW);
  digitalWrite(PIN_PED_G, pg ? HIGH : LOW);
}

void printPaddedLine(uint8_t row, const char* text) {
  lcd.setCursor(0, row);
  uint8_t len = (uint8_t)strlen(text);
  for (uint8_t i = 0; i < 16; i++) {
    lcd.print(i < len ? text[i] : ' ');
  }
}

void updateDisplay(int8_t remainingSec) {
  char line0[17];
  char line1[17];

  switch (state) {
    case ST_CAR_GREEN:
      snprintf(line0, sizeof(line0), "CARS: GO        ");
      snprintf(line1, sizeof(line1), pedRequested ? "WAIT: REQ QUEUED" : "PRESS BTN CROSS ");
      break;
    case ST_CAR_YELLOW:
      snprintf(line0, sizeof(line0), "CARS: CAUTION   ");
      snprintf(line1, sizeof(line1), "CLEARING IN %ds  ", remainingSec);
      break;
    case ST_ALL_RED:
      snprintf(line0, sizeof(line0), "ALL STOP        ");
      snprintf(line1, sizeof(line1), "SAFETY BUFFER   ");
      break;
    case ST_PED_WALK:
      snprintf(line0, sizeof(line0), "WALK: CROSS NOW ");
      snprintf(line1, sizeof(line1), "TIME LEFT: %2ds  ", remainingSec);
      break;
    case ST_PED_BLINK:
      snprintf(line0, sizeof(line0), "HURRY UP!       ");
      snprintf(line1, sizeof(line1), "CLOSING IN: %ds  ", remainingSec);
      break;
  }

  printPaddedLine(0, line0);
  printPaddedLine(1, line1);
}

void enterState(TrafficState next) {
  state = next;
  stateEnteredMs = millis();
  lastShownSec = -1;
  noTone(PIN_BUZZ);

  switch (state) {
    case ST_CAR_GREEN:
      setLights(false, false, true, true, false);
      Serial.println(F("State -> CAR_GREEN"));
      break;
    case ST_CAR_YELLOW:
      setLights(false, true, false, true, false);
      Serial.println(F("State -> CAR_YELLOW"));
      break;
    case ST_ALL_RED:
      setLights(true, false, false, true, false);
      Serial.println(F("State -> ALL_RED"));
      break;
    case ST_PED_WALK:
      pedRequested = false;
      setLights(true, false, false, false, true);
      Serial.println(F("State -> PED_WALK"));
      break;
    case ST_PED_BLINK:
      blinkOn = true;
      lastBlinkMs = millis();
      setLights(true, false, false, false, true);
      Serial.println(F("State -> PED_BLINK"));
      break;
  }

  updateDisplay(0);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_CAR_R, OUTPUT);
  pinMode(PIN_CAR_Y, OUTPUT);
  pinMode(PIN_CAR_G, OUTPUT);
  pinMode(PIN_PED_R, OUTPUT);
  pinMode(PIN_PED_G, OUTPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);
  pinMode(PIN_BUZZ, OUTPUT);

  lcd.init();
  lcd.backlight();
  Serial.println(F("Traffic Light & Pedestrian controller started."));
  enterState(ST_CAR_GREEN);
}

void loop() {
  uint32_t now = millis();

  if (digitalRead(PIN_BTN) == LOW && !pedRequested && (state == ST_CAR_GREEN || state == ST_CAR_YELLOW)) {
    pedRequested = true;
    tone(PIN_BUZZ, 1100, 60);
    Serial.println(F("Pedestrian button pressed -> crossing queued."));
    updateDisplay(0);
  }

  uint32_t elapsed = now - stateEnteredMs;

  switch (state) {
    case ST_CAR_GREEN: {
      uint32_t minGreen = pedRequested ? 2500UL : 7000UL;
      if (elapsed >= minGreen) {
        enterState(ST_CAR_YELLOW);
      }
      break;
    }
    case ST_CAR_YELLOW: {
      const uint32_t dur = 2500UL;
      int8_t rem = (int8_t)((dur - min(dur, elapsed) + 999UL) / 1000UL);
      if (rem != lastShownSec || now - lastLcdMs >= 250UL) {
        lastShownSec = rem;
        lastLcdMs = now;
        updateDisplay(rem);
      }
      if (elapsed >= dur) {
        enterState(ST_ALL_RED);
      }
      break;
    }
    case ST_ALL_RED:
      if (elapsed >= 1000UL) {
        enterState(ST_PED_WALK);
      }
      break;
    case ST_PED_WALK: {
      const uint32_t dur = 5000UL;
      int8_t rem = (int8_t)((dur - min(dur, elapsed) + 999UL) / 1000UL);
      if (rem != lastShownSec) {
        lastShownSec = rem;
        tone(PIN_BUZZ, 880, 90);
        updateDisplay(rem);
      }
      if (elapsed >= dur) {
        enterState(ST_PED_BLINK);
      }
      break;
    }
    case ST_PED_BLINK: {
      const uint32_t dur = 3000UL;
      if (now - lastBlinkMs >= 250UL) {
        lastBlinkMs = now;
        blinkOn = !blinkOn;
        digitalWrite(PIN_PED_G, blinkOn ? HIGH : LOW);
        if (blinkOn) {
          tone(PIN_BUZZ, 1320, 70);
        }
      }
      int8_t rem = (int8_t)((dur - min(dur, elapsed) + 999UL) / 1000UL);
      if (rem != lastShownSec) {
        lastShownSec = rem;
        updateDisplay(rem);
      }
      if (elapsed >= dur) {
        enterState(ST_CAR_GREEN);
      }
      break;
    }
  }
}
