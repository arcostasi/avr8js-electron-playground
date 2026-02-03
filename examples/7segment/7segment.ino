/*
  7-Segment Display Counter
  Counts 0 through 9 on a common-cathode 7-segment display, cycling indefinitely.
  Each segment is driven directly from a digital output pin (HIGH = segment ON).

  In a real circuit, place a 220-ohm current-limiting resistor on each segment pin.

  Wiring (common-cathode):
    Pin 2 -> Segment A (top)
    Pin 3 -> Segment B (upper right)
    Pin 4 -> Segment C (lower right)
    Pin 5 -> Segment D (bottom)
    Pin 6 -> Segment E (lower left)
    Pin 7 -> Segment F (upper left)
    Pin 8 -> Segment G (middle)
    GND   -> COM

  Segment layout:
     _
    |_|
    |_|
*/

// First pin assigned to segment A; segments A-G occupy pins 2-8 sequentially
const int SEG_A = 2;

// Digit patterns: bits 0-6 map to segments A-G respectively (1 = ON)
//                  A  B  C  D  E  F  G
const uint8_t DIGITS[10] = {
  0b0111111, // 0: A B C D E F
  0b0000110, // 1:   B C
  0b1011011, // 2: A B   D E   G
  0b1001111, // 3: A B C D     G
  0b1100110, // 4:   B C     F G
  0b1101101, // 5: A   C D   F G
  0b1111101, // 6: A   C D E F G
  0b0000111, // 7: A B C
  0b1111111, // 8: A B C D E F G
  0b1101111, // 9: A B C D   F G
};

// Display digit 0-9 on the 7-segment display
void showDigit(int digit) {
  uint8_t pattern = DIGITS[digit];
  for (int seg = 0; seg < 7; seg++) {
    digitalWrite(SEG_A + seg, (pattern >> seg) & 1);
  }
}

void setup() {
  for (int i = 0; i < 7; i++) {
    pinMode(SEG_A + i, OUTPUT);
    digitalWrite(SEG_A + i, LOW);
  }
  Serial.begin(9600);
  Serial.println("7-Segment Counter Demo");
}

void loop() {
  for (int digit = 0; digit <= 9; digit++) {
    showDigit(digit);
    Serial.println(digit);
    delay(800);
  }
}
