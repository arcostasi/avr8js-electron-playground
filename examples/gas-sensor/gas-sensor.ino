/*
  Gas Sensor (MQ-series)
  Reads both the analog concentration output (A0) and the digital threshold
  alert output (pin 4) from an MQ gas sensor module and prints the results.

  Wiring:
    VCC  -> 5V
    GND  -> GND
    AOUT -> A0   (continuous analog reading 0-1023)
    DOUT -> Pin 4 (LOW when concentration exceeds the on-board threshold potentiometer)

  Note: Allow 2 minutes of warm-up time for accurate MQ sensor readings.
*/

const int GAS_AO_PIN = A0; // Analog output — gas concentration level
const int GAS_DO_PIN = 4;  // Digital output — active-LOW threshold alert

// Threshold for "high concentration" warning (calibrate to your sensor)
const int HIGH_THRESHOLD = 600;

void setup() {
  pinMode(GAS_DO_PIN, INPUT); // Sensor has on-board pull-up
  Serial.begin(9600);
  Serial.println("Gas Sensor Demo");
  Serial.println("ADC  Status");
}

void loop() {
  int   raw     = analogRead(GAS_AO_PIN);
  bool  alert   = (digitalRead(GAS_DO_PIN) == LOW); // Active-LOW digital alarm

  Serial.print(raw);
  Serial.print("  ");

  if (alert || raw > HIGH_THRESHOLD) {
    Serial.println("!! HIGH GAS CONCENTRATION !!");
  } else {
    Serial.println("Normal");
  }

  delay(500);
}
