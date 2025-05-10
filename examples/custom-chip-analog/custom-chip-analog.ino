/*
  Custom Chip Analog API Example
  1) Build chips (F6)
  2) Run simulation (F5)

  Interactions:
    - AOUT drives A0 and is streamed to Serial Plotter
    - DOUT drives a status LED
    - AOUT also moves a servo for a visual analog output demo
*/

#include <Servo.h>

const uint8_t CHIP_AOUT = A0;
const uint8_t CHIP_DOUT = 8;
const uint8_t SERVO_PIN = 9;
const uint8_t STATUS_LED_PIN = 10;
unsigned long lastLog = 0;

Servo analogServo;

void setup() {
  Serial.begin(115200);
  pinMode(CHIP_DOUT, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  analogServo.attach(SERVO_PIN, 544, 2400);
}

void loop() {
  int analogValue = analogRead(CHIP_AOUT);
  int digitalValue = digitalRead(CHIP_DOUT);
  int angle = map(analogValue, 0, 1023, 0, 180);

  analogServo.write(angle);
  digitalWrite(STATUS_LED_PIN, digitalValue);

  if (millis() - lastLog >= 40) {
    lastLog = millis();
    // Two numeric columns for Serial Plotter: analog waveform and digital gate.
    Serial.print(analogValue);
    Serial.print(',');
    Serial.println(digitalValue ? 1023 : 0);
  }
}
