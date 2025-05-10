/*
  Custom Chip SPI API Example
  1) Build chips (F6)
  2) Run simulation (F5)

  The byte returned by the custom SPI chip is converted into movement on a stepper motor.
*/

#include <SPI.h>
#include <Stepper.h>

const int STEPS_PER_REV = 64;
Stepper demoStepper(STEPS_PER_REV, 4, 5, 6, 7);

unsigned long lastXfer = 0;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  pinMode(10, OUTPUT);
  digitalWrite(10, LOW);
  demoStepper.setSpeed(12);
}

void loop() {
  if (millis() - lastXfer >= 300) {
    lastXfer = millis();
    byte value = SPI.transfer(0x55);
    int delta = map(value, 0, 255, -8, 8);
    if (delta != 0) {
      demoStepper.step(delta);
    }
    Serial.print("SPI recv=0x");
    if (value < 16) Serial.print('0');
    Serial.println(value, HEX);
  }
}
