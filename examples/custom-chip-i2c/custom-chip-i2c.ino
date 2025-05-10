/*
  Custom Chip I2C API Example
  1) Build chips (F6)
  2) Run simulation (F5)

  The byte read from the custom I2C chip is rendered on an LED bar graph.
*/

#include <Wire.h>

const uint8_t CHIP_ADDR = 0x42;
const uint8_t BAR_PINS[8] = { 2, 3, 4, 5, 6, 7, 8, 9 };
unsigned long lastPoll = 0;

void showByte(uint8_t value) {
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(BAR_PINS[i], (value >> i) & 0x01 ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(BAR_PINS[i], OUTPUT);
  }
  showByte(0);
}

void loop() {
  if (millis() - lastPoll >= 400) {
    lastPoll = millis();

    Wire.beginTransmission(CHIP_ADDR);
    Wire.write((uint8_t)(millis() / 400));
    Wire.endTransmission();

    Wire.requestFrom((int)CHIP_ADDR, 1);
    if (Wire.available()) {
      uint8_t value = (uint8_t)Wire.read();
      showByte(value);
      Serial.print("I2C byte=");
      Serial.println(value);
    }
  }
}
