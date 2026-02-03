/*
  PIR Motion Sensor
  Reads a passive infrared (PIR) motion sensor on pin 7.
  When motion is detected (OUT goes HIGH), the LED on pin 13 turns on
  for a hold time, then turns off until the next trigger.

  Wiring:
    VCC -> 5V
    GND -> GND
    OUT -> Pin 7 (active-HIGH output)
    Pin 13 -> 220 Ohm -> LED anode (A) -> LED cathode (C) -> GND
*/

const int PIR_PIN  = 7;  // PIR sensor output (active-HIGH)
const int LED_PIN  = 13; // Alarm LED

const unsigned long HOLD_MS = 3000; // Keep LED on 3 s after motion stops

unsigned long lastMotionTime = 0; // Timestamp of last detected motion

void setup() {
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("PIR Motion Sensor Demo");
  Serial.println("Waiting for motion...");
}

void loop() {
  bool motion = (digitalRead(PIR_PIN) == HIGH);

  if (motion) {
    lastMotionTime = millis(); // Refresh hold timer
    digitalWrite(LED_PIN, HIGH);
    Serial.println("Motion detected!");
  } else if (millis() - lastMotionTime > HOLD_MS) {
    // Hold period expired with no new motion
    if (digitalRead(LED_PIN) == HIGH) {
      digitalWrite(LED_PIN, LOW);
      Serial.println("No motion — LED off.");
    }
  }

  delay(50);
}
