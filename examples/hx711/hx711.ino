/*
  HX711 Load Cell Amplifier
  Reads the raw 24-bit value from a load cell connected to an HX711 module,
  tares (zeroes) the scale on startup, and prints the weight in grams.

  Wiring:
    VCC -> 5V
    GND -> GND
    DT  -> Pin 3
    SCK -> Pin 2

  Library: HX711 Arduino Library by bogde >= 0.7
*/

#include <HX711.h>

const int DOUT_PIN = 3; // HX711 Data output pin
const int CLK_PIN  = 2; // HX711 Clock pin

// Calibration factor: raw units per gram.
// Run the sketch with a known weight to find your specific value.
// Typical range for a 5 kg load cell: 420 – 450
const float CALIBRATION_FACTOR = 430.0f;

HX711 scale;

void setup() {
  Serial.begin(9600);
  scale.begin(DOUT_PIN, CLK_PIN);

  Serial.println("HX711 Load Cell Demo");
  Serial.println("Taring (zeroing) scale — remove any load...");
  delay(2000);

  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare(); // Zero the scale with nothing on it

  Serial.println("Scale ready. Place a weight and observe the reading.");
  Serial.println("-------------------------------------------");
}

void loop() {
  if (scale.is_ready()) {
    float grams = scale.get_units(5);    // Average 5 readings for stability
    float kg    = grams / 1000.0f;

    Serial.print("Weight: ");
    Serial.print(grams, 1);
    Serial.print(" g  (");
    Serial.print(kg, 3);
    Serial.println(" kg)");
  } else {
    Serial.println("HX711 not ready...");
  }

  delay(500);
}
