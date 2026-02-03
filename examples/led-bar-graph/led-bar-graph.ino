/*
  LED Bar Graph
  Animates a 10-segment LED bar graph with a chasing light effect,
  followed by a fill-up/empty-down sequence.

  In a real circuit add a 220-ohm resistor in series with each anode pin.

  Wiring:
    Pins 2-11 -> Anodes A1-A10 (in order)
    Cathodes B1-B10 -> GND
*/

const int FIRST_PIN   = 2;  // Pin for anode A1
const int NUM_LEDS    = 10; // 10 segments in the bar graph

void allOff() {
  for (int i = 0; i < NUM_LEDS; i++) {
    digitalWrite(FIRST_PIN + i, LOW);
  }
}

void setup() {
  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(FIRST_PIN + i, OUTPUT);
  }
  allOff();
}

void loop() {
  // Chase: a single lit segment runs left to right, then right to left
  for (int i = 0; i < NUM_LEDS; i++) {
    allOff();
    digitalWrite(FIRST_PIN + i, HIGH);
    delay(80);
  }
  for (int i = NUM_LEDS - 2; i > 0; i--) {
    allOff();
    digitalWrite(FIRST_PIN + i, HIGH);
    delay(80);
  }

  // Fill up from bottom to top, then empty top to bottom
  for (int i = 0; i < NUM_LEDS; i++) {
    digitalWrite(FIRST_PIN + i, HIGH);
    delay(80);
  }
  for (int i = NUM_LEDS - 1; i >= 0; i--) {
    digitalWrite(FIRST_PIN + i, LOW);
    delay(80);
  }

  delay(300);
}
