/*
  Slide Switch
  Reads a slide switch on pin 2 (with internal pull-up) and controls an LED on pin 13.
  Slide to position 1 to turn the LED ON; slide to position 2 to turn it OFF.

  Wiring:
    Switch pin 2 (common) -> Pin 2
    Switch pin 1           -> GND
    Pin 13 -> 220 Ohm resistor -> LED anode (A) -> LED cathode (C) -> GND
*/

const int SWITCH_PIN = 2;  // Slide switch common contact (INPUT_PULLUP)
const int LED_PIN    = 13; // LED output

void setup() {
  pinMode(SWITCH_PIN, INPUT_PULLUP); // Internal pull-up; LOW when switch connects to GND
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Slide Switch Demo");
}

void loop() {
  bool active = (digitalRead(SWITCH_PIN) == LOW); // LOW means switch is closed to GND
  digitalWrite(LED_PIN, active ? HIGH : LOW);

  Serial.println(active ? "Switch ON  -> LED ON" : "Switch OFF -> LED OFF");
  delay(100);
}
