/*
  Servo Motor — Potentiometer Control
  Maps the position of a potentiometer (A0) to a servo angle (0-180°).
  Rotate the potentiometer knob to move the servo arm.

  Wiring:
    Potentiometer VCC -> 3.3V (or 5V), GND -> GND, SIG -> A0
    Servo V+  -> 5V
    Servo GND -> GND
    Servo PWM -> Pin 9

  Library: Servo (built-in with Arduino IDE)
*/

#include <Servo.h>

const int POT_PIN   = A0; // Potentiometer wiper
const int SERVO_PIN = 9;  // Servo PWM signal pin

Servo myServo;

void setup() {
  myServo.attach(SERVO_PIN, 544, 2400); // Min/max pulse widths (µs)
  Serial.begin(9600);
  Serial.println("Servo Potentiometer Demo");
}

void loop() {
  int raw   = analogRead(POT_PIN);             // 0 – 1023
  int angle = map(raw, 0, 1023, 0, 180);       // Convert to degrees

  myServo.write(angle);

  Serial.print("ADC: ");
  Serial.print(raw);
  Serial.print("  Angle: ");
  Serial.print(angle);
  Serial.println(" deg");

  delay(20); // Update at ~50 Hz (servo standard rate)
}
