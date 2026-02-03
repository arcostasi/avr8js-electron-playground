/*
  Potentiometer
  Reads the wiper of a 10k potentiometer on analog pin A0,
  converts the 10-bit ADC value to voltage, and prints it via Serial.

  Wiring:
    VCC  -> 5V
    GND  -> GND
    SIG  -> A0
*/

const int POT_PIN = A0; // Analog input connected to potentiometer wiper

void setup() {
  Serial.begin(9600);
  Serial.println("Potentiometer Demo");
  Serial.println("------------------");
}

void loop() {
  int raw   = analogRead(POT_PIN);                  // 0 – 1023
  float voltage = raw * (5.0f / 1023.0f);           // Convert to volts

  // Map raw ADC value to a 0-100% percentage
  int percent = map(raw, 0, 1023, 0, 100);

  Serial.print("ADC: ");
  Serial.print(raw);
  Serial.print("  |  Voltage: ");
  Serial.print(voltage, 2);
  Serial.print(" V  |  Position: ");
  Serial.print(percent);
  Serial.println(" %");

  delay(200);
}
