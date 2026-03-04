/*
  Relay Module
  Drives a KS2E relay module from pin 7 (active-HIGH trigger).
  The relay's Normally-Open (NO) contact switches a load LED on and off.

  Wiring:
    COIL2 -> GND
    COIL1 -> Pin 7       (HIGH = relay ON)
    P1    -> 5V          (load power supply)
    NO1   -> 220 Ohm -> LED anode; LED cathode -> GND
*/

const int RELAY_PIN = 7; // Relay control signal (active-HIGH)

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Start with relay de-energized
  Serial.begin(9600);
  Serial.println("Relay Module Demo");
}

void loop() {
  Serial.println("Relay ON  -> Load powered");
  digitalWrite(RELAY_PIN, HIGH); // Energize relay — NO contact closes
  delay(2000);

  Serial.println("Relay OFF -> Load unpowered");
  digitalWrite(RELAY_PIN, LOW);  // De-energize relay — NO contact opens
  delay(2000);
}
