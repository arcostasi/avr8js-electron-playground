/*
  Flame Sensor Alarm
  Reads the digital output of an IR flame sensor on pin 4.
  When flame is detected (DO goes LOW), an audible alarm sounds on pin 8.

  Wiring:
    Flame sensor VCC -> 5V, GND -> GND, DO -> Pin 4
    Buzzer pin 1     -> Pin 8
    Buzzer pin 2     -> GND
*/

const int FLAME_PIN  = 4; // Flame sensor digital output (active-LOW)
const int BUZZER_PIN = 8; // Passive buzzer control pin

// Alarm tone frequency and pattern
const int ALARM_FREQ = 1000; // Hz

void setup() {
  pinMode(FLAME_PIN,  INPUT);   // Sensor has on-board pull-up
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Flame Sensor Demo — monitoring for fire...");
}

void loop() {
  // DO is active-LOW: LOW = flame detected, HIGH = no flame
  bool flameDetected = (digitalRead(FLAME_PIN) == LOW);

  if (flameDetected) {
    Serial.println("!! FLAME DETECTED — ALARM !!");

    // Alternating tone burst pattern
    tone(BUZZER_PIN, ALARM_FREQ, 200);
    delay(300);
    tone(BUZZER_PIN, ALARM_FREQ / 2, 200);
    delay(300);
  } else {
    noTone(BUZZER_PIN);
    Serial.println("Clear");
    delay(500);
  }
}
