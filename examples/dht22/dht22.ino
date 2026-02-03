/*
  DHT22 — Temperature & Humidity
  Reads temperature (°C / °F) and relative humidity (%) from a DHT22 sensor
  and prints the readings to the Serial Monitor every 2 seconds.

  Wiring:
    VCC  -> 5V
    GND  -> GND
    SDA  -> Pin 7

  Library: DHT sensor library by Adafruit >= 1.4
*/

#include <DHT.h>

#define DHT_PIN  7          // Data pin connected to DHT22 SDA
#define DHT_TYPE DHT22      // Sensor model

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
  Serial.println("DHT22 Demo");
  Serial.println("----------");
}

void loop() {
  // DHT22 requires at least 2 s between readings
  delay(2000);

  float humidity    = dht.readHumidity();       // Relative humidity (%)
  float tempC       = dht.readTemperature();    // Celsius
  float tempF       = dht.readTemperature(true);// Fahrenheit

  // Check for sensor read failure
  if (isnan(humidity) || isnan(tempC)) {
    Serial.println("Error: Failed to read from DHT22 sensor!");
    return;
  }

  // Heat index (feels-like temperature)
  float heatIndexC = dht.computeHeatIndex(tempC, humidity, false);
  float heatIndexF = dht.computeHeatIndex(tempF, humidity);

  Serial.print("Humidity:    "); Serial.print(humidity, 1);   Serial.println(" %");
  Serial.print("Temp:        "); Serial.print(tempC, 1);      Serial.print(" C  /  ");
  Serial.print(tempF, 1);        Serial.println(" F");
  Serial.print("Heat index:  "); Serial.print(heatIndexC, 1); Serial.print(" C  /  ");
  Serial.print(heatIndexF, 1);   Serial.println(" F");
  Serial.println();
}
