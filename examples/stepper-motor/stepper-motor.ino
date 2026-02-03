/*
  Stepper Motor — Full 360° Rotation
  Rotates a stepper motor one full revolution forward, pauses, then reverses.
  The wokwi-stepper-motor element models a 28BYJ-48 style motor with
  a 64-step-per-revolution, 4-phase unipolar coil sequence.

  Wiring:
    IN1 -> Pin 8
    IN2 -> Pin 9
    IN3 -> Pin 10
    IN4 -> Pin 11
    5V  -> 5V
    GND -> GND

  Library: Stepper (built-in with Arduino IDE)
*/

#include <Stepper.h>

// Steps per full mechanical revolution (64 internal steps for 28BYJ-48)
const int STEPS_PER_REV = 64;

// Stepper coil order: IN1, IN3, IN2, IN4 for correct half-step sequence
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
