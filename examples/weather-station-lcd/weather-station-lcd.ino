/*
  Smart Weather Station — DHT22 + LCD1602 I2C + Comfort LEDs + Unit Toggle Button
  - Self-contained DHT22 single-wire timing reader (no external DHT library required)
  - DHT22: SDA -> D7
  - Status LEDs: Cold/Blue (D10), Comfort/Green (D11), Hot/Red (D12)
  - Unit Toggle Pushbutton (C / F): D2 (INPUT_PULLUP)
  - High-temperature Alert Buzzer: D8
  - LCD1602 I2C (0x27): SDA -> A4, SCL -> A5
*/
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define PIN_DHT   7
#define PIN_COLD  10
#define PIN_OK    11
#define PIN_HOT   12
#define PIN_BTN   2
#define PIN_BUZZ  8

LiquidCrystal_I2C lcd(0x27, 16, 2);

bool showFahrenheit = false;
bool lastBtnState = HIGH;
uint32_t lastReadMs = 0;

uint16_t expectPulse(uint8_t pin, uint8_t level) {
  uint16_t count = 0;
  while ((uint8_t)digitalRead(pin) == level) {
    if (++count >= 10000U) {
      return 0xFFFFU;
    }
  }
  return count;
}

bool readDHT22(uint8_t pin, float& outTempC, float& outHumidity) {
  uint8_t data[5] = { 0, 0, 0, 0, 0 };

  // Start signal: pull DATA low >= 1ms, then release with pull-up
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delayMicroseconds(1200);
  pinMode(pin, INPUT_PULLUP);
  delayMicroseconds(25);

  uint16_t pulses[80];
  noInterrupts();
  if (expectPulse(pin, LOW) == 0xFFFFU || expectPulse(pin, HIGH) == 0xFFFFU) {
    interrupts();
    return false;
  }
  for (uint8_t i = 0; i < 40; i++) {
    pulses[i * 2]     = expectPulse(pin, LOW);
    pulses[i * 2 + 1] = expectPulse(pin, HIGH);
  }
  interrupts();

  for (uint8_t i = 0; i < 40; i++) {
    uint16_t lowCycles  = pulses[i * 2];
    uint16_t highCycles = pulses[i * 2 + 1];
    if (lowCycles == 0xFFFFU || highCycles == 0xFFFFU) {
      return false;
    }
    data[i >> 3] <<= 1;
    if (highCycles > lowCycles) {
      data[i >> 3] |= 1;
    }
  }

  uint8_t checksum = (uint8_t)(data[0] + data[1] + data[2] + data[3]);
  if (data[4] != checksum) {
    return false;
  }

  outHumidity = ((uint16_t)data[0] << 8 | data[1]) * 0.1f;
  uint16_t rawT = ((uint16_t)(data[2] & 0x7F) << 8) | data[3];
  outTempC = rawT * 0.1f;
  if (data[2] & 0x80) {
    outTempC = -outTempC;
  }
  return true;
}

static inline float convertCtoF(float c) {
  return c * 1.8f + 32.0f;
}

float computeHeatIndexC(float tempC, float rh) {
  float t = convertCtoF(tempC);
  float hiF = 0.5f * (t + 61.0f + ((t - 68.0f) * 1.2f) + (rh * 0.094f));
  if (hiF >= 79.0f) {
    hiF = -42.379f
      + 2.04901523f * t
      + 10.14333127f * rh
      - 0.22475541f * t * rh
      - 0.00683783f * t * t
      - 0.05481717f * rh * rh
      + 0.00122874f * t * t * rh
      + 0.00085282f * t * rh * rh
      - 0.00000199f * t * t * rh * rh;
  }
  return (hiF - 32.0f) / 1.8f;
}

void setComfortLeds(float tempC) {
  digitalWrite(PIN_COLD, tempC < 18.0f ? HIGH : LOW);
  digitalWrite(PIN_OK,   (tempC >= 18.0f && tempC <= 28.0f) ? HIGH : LOW);
  digitalWrite(PIN_HOT,  tempC > 28.0f ? HIGH : LOW);
}

void printPadded(uint8_t row, const char* text) {
  lcd.setCursor(0, row);
  uint8_t len = (uint8_t)strlen(text);
  for (uint8_t i = 0; i < 16; i++) {
    lcd.print(i < len ? text[i] : ' ');
  }
}

void updateDisplayAndTelemetry(bool emitSerial) {
  float humidity = 0.0f;
  float tempC = 0.0f;
  if (!readDHT22(PIN_DHT, tempC, humidity)) {
    printPadded(0, "DHT22 READ ERR");
    printPadded(1, "Check sensor");
    return;
  }

  float heatIdxC = computeHeatIndexC(tempC, humidity);
  setComfortLeds(tempC);

  if (tempC >= 34.0f) {
    tone(PIN_BUZZ, 1480, 90);
  }

  float shownTemp = showFahrenheit ? convertCtoF(tempC) : tempC;
  float shownHi   = showFahrenheit ? convertCtoF(heatIdxC) : heatIdxC;
  char unit = showFahrenheit ? 'F' : 'C';

  char tBuf[8];
  char hBuf[8];
  char hiBuf[8];
  dtostrf(shownTemp, 4, 1, tBuf);
  dtostrf(humidity, 4, 1, hBuf);
  dtostrf(shownHi, 4, 1, hiBuf);

  const char* comfort = "OK ";
  if (tempC < 18.0f) comfort = "CLD";
  else if (tempC > 28.0f) comfort = "HOT";

  char line0[17];
  char line1[17];
  snprintf(line0, sizeof(line0), "T:%s%c H:%s%%", tBuf, unit, hBuf);
  snprintf(line1, sizeof(line1), "HI:%s%c [%s]", hiBuf, unit, comfort);
  printPadded(0, line0);
  printPadded(1, line1);

  if (emitSerial) {
    Serial.print(F("Temp: "));
    Serial.print(tempC, 1);
    Serial.print(F(" | Humidity: "));
    Serial.print(humidity, 1);
    Serial.print(F(" | HeatIdx: "));
    Serial.println(heatIdxC, 1);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_COLD, OUTPUT);
  pinMode(PIN_OK, OUTPUT);
  pinMode(PIN_HOT, OUTPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);
  pinMode(PIN_BUZZ, OUTPUT);
  pinMode(PIN_DHT, INPUT_PULLUP);

  lcd.init();
  lcd.backlight();
  printPadded(0, "WEATHER STATION");
  printPadded(1, "Btn toggles C/F");
  Serial.println(F("Smart Weather Station ready. Press button for C/F toggle."));
  delay(500);
  updateDisplayAndTelemetry(true);
  lastReadMs = millis();
}

void loop() {
  bool btn = digitalRead(PIN_BTN);
  if (lastBtnState == HIGH && btn == LOW) {
    delay(25);
    if (digitalRead(PIN_BTN) == LOW) {
      showFahrenheit = !showFahrenheit;
      tone(PIN_BUZZ, showFahrenheit ? 1200 : 900, 45);
      Serial.print(F("Display unit -> "));
      Serial.println(showFahrenheit ? F("Fahrenheit") : F("Celsius"));
      updateDisplayAndTelemetry(false);
    }
  }
  lastBtnState = btn;

  if (millis() - lastReadMs >= 2000UL) {
    lastReadMs = millis();
    updateDisplayAndTelemetry(true);
  }
}
