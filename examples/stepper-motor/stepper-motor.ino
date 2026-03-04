/*
  Stepper Motor — Full 360° Rotation
  Rotates a stepper motor one full revolution forward, pauses, then reverses.
  The wokwi-stepper-motor element models a 28BYJ-48 style motor with
  a 64-step-per-revolution, 4-phase unipolar coil sequence.

  Wiring (wokwi-stepper-motor pins):
    A+ -> Pin 8
    A- -> Pin 10
    B+ -> Pin 9
    B- -> Pin 11
    5V  -> 5V
    GND -> GND

  Library: Stepper (built-in with Arduino IDE)
*/

#include <Stepper.h>

// Steps per full mechanical revolution (64 internal steps for 28BYJ-48)
const int STEPS_PER_REV = 64;

// Stepper coil order: A+, A-, B+, B- → pins 8, 10, 9, 11
// The Stepper library drives (pin1, pin2, pin3, pin4) as two complementary
// coil pairs, which matches the wokwi-stepper-motor (A+/A-) and (B+/B-) model.
Stepper myStepper(STEPS_PER_REV, 8, 10, 9, 11);

void setup() {
  myStepper.setSpeed(12); // RPM; keep low for smooth operation
  Serial.begin(9600);
  Serial.println("Stepper Motor Demo");
}

void loop() {
  Serial.println("Rotating clockwise one revolution...");
  myStepper.step(STEPS_PER_REV);
  delay(500);

  Serial.println("Rotating counter-clockwise one revolution...");
  myStepper.step(-STEPS_PER_REV);
  delay(500);
}
