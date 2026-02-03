/*
  Buzzer — Musical Notes
  Plays a simple scale melody using the built-in tone() function.
  Works with a passive (electromagnetic) buzzer.

  Wiring:
    Pin 8 -> Buzzer positive (pin 1)
    GND   -> Buzzer negative (pin 2)
*/

const int BUZZER_PIN = 8; // Digital pin connected to buzzer

// Note frequencies in Hz (standard equal temperament)
const int NOTE_C4  = 262;
const int NOTE_D4  = 294;
const int NOTE_E4  = 330;
const int NOTE_F4  = 349;
const int NOTE_G4  = 392;
const int NOTE_A4  = 440;
const int NOTE_B4  = 494;
const int NOTE_C5  = 523;

// Melody: note frequencies and durations (ms)
const int melody[]   = { NOTE_C4, NOTE_D4, NOTE_E4, NOTE_F4,
                          NOTE_G4, NOTE_A4, NOTE_B4, NOTE_C5 };
const int durations[] = { 300, 300, 300, 300, 300, 300, 300, 500 };

const int NOTES = sizeof(melody) / sizeof(melody[0]);

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i < NOTES; i++) {
    tone(BUZZER_PIN, melody[i], durations[i]);
    delay(durations[i] + 50); // Brief gap between notes
  }
  noTone(BUZZER_PIN);
  delay(1000); // Pause before repeating
}
