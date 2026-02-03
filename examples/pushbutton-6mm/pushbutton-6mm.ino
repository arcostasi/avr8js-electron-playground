/*
  Pushbutton 6mm
  Reads a compact 6mm pushbutton on pin 2 (internal pull-up) and controls an LED on pin 13.
  The LED turns ON while the button is pressed (active-LOW logic).

  Wiring:
    Pin 2  -> Button terminal 1 (other terminal to GND)
    Pin 13 -> 220 Ohm resistor -> LED anode (A) -> LED cathode (C) -> GND
*/

const int BUTTON_PIN = 2;  // 6mm pushbutton (internal pull-up enabled)
const int LED_PIN    = 13; // LED output

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = (digitalRead(BUTTON_PIN) == LOW);
  digitalWrite(LED_PIN, pressed ? HIGH : LOW);
  Serial.println(pressed ? "Pressed" : "Released");
  delay(50);
}
