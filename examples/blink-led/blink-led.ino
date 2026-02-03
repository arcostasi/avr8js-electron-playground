/*
  Blink LED
  Turns an external LED on and off every 500 ms.

  Wiring:
    Pin 13 -> 220 Ohm resistor -> LED anode (A)
    LED cathode (C) -> GND
*/

// LED connected to digital pin 13 via 220-ohm resistor
const int LED_PIN = 13;

void setup() {
  // Configure LED pin as output
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH); // Turn LED on
  delay(500);                   // Wait 500 ms
  digitalWrite(LED_PIN, LOW);  // Turn LED off
  delay(500);                   // Wait 500 ms
}
