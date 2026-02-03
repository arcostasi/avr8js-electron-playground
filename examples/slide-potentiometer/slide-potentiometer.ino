/*
  Slide Potentiometer
  Reads a slide potentiometer on A0 and uses the value to control
  the brightness of an LED on PWM pin 9.

  Wiring:
    Slide pot VCC -> 5V
    Slide pot GND -> GND
    Slide pot SIG -> A0
    Pin 9 -> 220 Ohm resistor -> LED anode (A) -> LED cathode (C) -> GND
*/

const int POT_PIN = A0; // Slide potentiometer wiper
const int LED_PIN = 9;  // PWM-capable pin for LED brightness

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Slide Potentiometer Demo");
}

void loop() {
  int raw        = analogRead(POT_PIN);          // 0 – 1023
  int brightness = map(raw, 0, 1023, 0, 255);    // Map to PWM range

  analogWrite(LED_PIN, brightness);

  Serial.print("ADC: ");
  Serial.print(raw);
  Serial.print("  Brightness: ");
  Serial.println(brightness);

  delay(50);
}
