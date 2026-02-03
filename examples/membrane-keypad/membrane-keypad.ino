/*
  Membrane Keypad (4×4)
  Reads keypresses from a standard 4×4 membrane keypad and prints the
  pressed key character to the Serial Monitor.

  Wiring:
    Row pins R1-R4 -> Arduino pins 2, 3, 4, 5
    Col pins C1-C4 -> Arduino pins 6, 7, 8, 9

  Library: Keypad by Mark Stanley and Alexander Brevig >= 3.1
*/

#include <Keypad.h>

const byte ROWS = 4;  // Number of keypad rows
const byte COLS = 4;  // Number of keypad columns

// Key map — matches the physical layout of a standard 4×4 membrane keypad
char keys[ROWS][COLS] = {
  { '1', '2', '3', 'A' },
  { '4', '5', '6', 'B' },
  { '7', '8', '9', 'C' },
  { '*', '0', '#', 'D' }
};

// Map rows and columns to Arduino digital pins
byte rowPins[ROWS] = { 2, 3, 4, 5 }; // R1, R2, R3, R4
byte colPins[COLS] = { 6, 7, 8, 9 }; // C1, C2, C3, C4

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

void setup() {
  Serial.begin(9600);
  Serial.println("Membrane Keypad Demo — press a key");
}

void loop() {
  char key = keypad.getKey();

  if (key != NO_KEY) {
    Serial.print("Key pressed: ");
    Serial.println(key);
  }
}
