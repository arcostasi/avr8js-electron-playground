/*
  DIP Switch 8
  Reads eight independent DIP switch contacts and prints their states
  as a binary byte and decimal value to the Serial Monitor.

  Wiring (per switch 1-8):
    xA pin -> Arduino digital pin (2-9) with INPUT_PULLUP enabled
    xB pin -> GND
  When a switch is ON, xA is pulled LOW (active-LOW logic).
*/

// First digital pin for switch 1; switches occupy pins 2..9 sequentially
const int FIRST_PIN = 2;
const int NUM_SWITCHES = 8;

void setup() {
  // Configure all switch input pins with internal pull-ups
  for (int i = 0; i < NUM_SWITCHES; i++) {
    pinMode(FIRST_PIN + i, INPUT_PULLUP);
  }
  Serial.begin(9600);
  Serial.println("DIP Switch 8 Demo");
  Serial.println("SW: 87654321");
}

void loop() {
  uint8_t value = 0;

  // Build a byte: bit 0 = switch 1, bit 7 = switch 8
  for (int i = 0; i < NUM_SWITCHES; i++) {
    bool on = (digitalRead(FIRST_PIN + i) == LOW); // LOW = switch ON
    if (on) {
      value |= (1 << i);
    }
  }

  // Print binary representation (MSB first for readability)
  Serial.print("SW: ");
  for (int i = NUM_SWITCHES - 1; i >= 0; i--) {
    Serial.print((value >> i) & 1);
  }
  Serial.print("  DEC: ");
  Serial.println(value);

  delay(250);
}
