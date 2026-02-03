/*
  NTC Temperature Sensor
  Reads the analog voltage from an NTC thermistor module on A0 and converts it
  to a temperature in Celsius using the simplified Steinhart-Hart (B-parameter) equation.

  The wokwi-ntc-temperature-sensor module has a built-in 10k pull-down resistor;
  the output voltage increases as temperature increases.

  Wiring:
    VCC -> 5V
    GND -> GND
    OUT -> A0

  Note: The wokwi element outputs a pre-divided analog voltage — the raw ADC value
  maps directly to temperature without a separate voltage divider calculation.
*/

const int  NTC_PIN       = A0;    // Analog input from NTC module
const float VCC           = 5.0f; // Supply voltage (V)
const float R_FIXED       = 10000.0f; // Fixed pull-up/pull-down resistor (Ω)
const float BETA          = 3950.0f;  // NTC B-coefficient (typical 10k NTC)
const float T0_KELVIN     = 298.15f;  // Reference temperature (25 °C in Kelvin)
const float R0            = 10000.0f; // NTC nominal resistance at T0 (Ω)

// Convert ADC reading to Celsius using B-parameter equation
float readTemperatureC(int adc) {
  // Voltage at the analog pin
  float voltage = adc * VCC / 1023.0f;

  // Resistance of NTC (voltage divider with R_FIXED as pull-down)
  float rNTC = R_FIXED * voltage / (VCC - voltage);

  // Steinhart-Hart B-parameter form: 1/T = 1/T0 + (1/B)*ln(R/R0)
  float tempKelvin = 1.0f / (1.0f / T0_KELVIN + (1.0f / BETA) * log(rNTC / R0));
  return tempKelvin - 273.15f;
}

void setup() {
  Serial.begin(9600);
  Serial.println("NTC Temperature Sensor Demo");
  Serial.println("----------------------------");
}

void loop() {
  int   raw  = analogRead(NTC_PIN);
  float tempC = readTemperatureC(raw);
  float tempF = tempC * 9.0f / 5.0f + 32.0f;

  Serial.print("ADC: "); Serial.print(raw);
  Serial.print("  Temp: "); Serial.print(tempC, 1); Serial.print(" C  /  ");
  Serial.print(tempF, 1); Serial.println(" F");

  delay(500);
}
