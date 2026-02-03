/*
  RGB LED Color Cycle
  Fades through the color spectrum on a common-cathode RGB LED using PWM.

  Wiring (common-cathode):
    Pin 9  -> 220 Ohm resistor -> R pin
    Pin 10 -> 220 Ohm resistor -> G pin
    Pin 11 -> 220 Ohm resistor -> B pin
    COM    -> GND
*/

const int PIN_R = 9;  // Red channel   (PWM)
const int PIN_G = 10; // Green channel (PWM)
const int PIN_B = 11; // Blue channel  (PWM)

// Set all three color channels at once
void setColor(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_R, r);
  analogWrite(PIN_G, g);
  analogWrite(PIN_B, b);
}

// Smoothly fade from one color to another in `steps` steps
void fadeTo(uint8_t r1, uint8_t g1, uint8_t b1,
            uint8_t r2, uint8_t g2, uint8_t b2,
            int steps, int stepDelayMs) {
  for (int i = 0; i <= steps; i++) {
    uint8_t r = r1 + (int)(r2 - r1) * i / steps;
    uint8_t g = g1 + (int)(g2 - g1) * i / steps;
    uint8_t b = b1 + (int)(b2 - b1) * i / steps;
    setColor(r, g, b);
    delay(stepDelayMs);
  }
}

void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
}

void loop() {
  // Cycle: red -> green -> blue -> white -> off
  fadeTo(255,   0,   0,   0, 255,   0, 50, 10); // Red   -> Green
  fadeTo(  0, 255,   0,   0,   0, 255, 50, 10); // Green -> Blue
  fadeTo(  0,   0, 255, 255, 255, 255, 50, 10); // Blue  -> White
  fadeTo(255, 255, 255,   0,   0,   0, 50, 10); // White -> Off
  delay(300);
}
