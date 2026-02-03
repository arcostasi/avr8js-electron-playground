/*
  Photoresistor (LDR) — Auto-Dimming LED
  Reads ambient light from a photoresistor sensor module (A0) and inversely maps
  the brightness: brighter environment = dimmer LED (ideal as a nightlight).

  Wiring:
    Photoresistor VCC -> 5V, GND -> GND, AO -> A0
    Pin 9 -> 220 Ohm -> LED anode (A) -> LED cathode (C) -> GND
*/

const int LDR_PIN = A0; // Photoresistor analog output
const int LED_PIN = 9;  // PWM pin for LED brightness control

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Photoresistor Auto-Dimming Demo");
  Serial.println("Light  LED");
}

void loop() {
  int light = analogRead(LDR_PIN);               // 0 = dark, 1023 = bright

  // Invert: more light → less brightness (nightlight behaviour)
  int brightness = map(light, 0, 1023, 255, 0);

  analogWrite(LED_PIN, brightness);

  Serial.print(light);
  Serial.print("  ");
  Serial.println(brightness);

  delay(100);
}
