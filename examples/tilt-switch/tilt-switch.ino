/*
  Tilt Switch
  Detects device orientation with a ball tilt sensor.
  When the switch is upright the ball closes the contacts (reads LOW with pull-up);
  when tilted the contacts open (reads HIGH).

  Wiring:
    Tilt pin 1 -> Pin 2
    Tilt pin 2 -> GND
    Pin 13 -> 220 Ohm resistor -> LED anode (A) -> LED cathode (C) -> GND
*/

const int TILT_PIN = 2;  // Tilt switch input (INPUT_PULLUP)
const int LED_PIN  = 13; // LED output

void setup() {
  pinMode(TILT_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Tilt Switch Demo");
}

void loop() {
  // LOW = upright (ball completes circuit); HIGH = tilted (circuit open)
  bool upright = (digitalRead(TILT_PIN) == LOW);
  digitalWrite(LED_PIN, upright ? HIGH : LOW);

  Serial.println(upright ? "Upright  -> LED ON" : "Tilted   -> LED OFF");
  delay(100);
}
