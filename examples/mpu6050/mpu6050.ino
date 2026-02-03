/*
  MPU-6050 IMU — Accelerometer & Gyroscope
  Reads 3-axis acceleration (m/s²) and angular velocity (°/s) from an MPU-6050
  module over I2C and prints the values to the Serial Monitor.

  Wiring:
    VCC -> 3.3V   (MPU-6050 is 3.3V logic; 5V-tolerant on some breakout boards)
    GND -> GND
    SDA -> A4
    SCL -> A5

  Library: Adafruit MPU6050 >= 2.2 (depends on Adafruit_Sensor and Wire)
*/

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(9600);
  Serial.println("MPU-6050 Demo");

  if (!mpu.begin()) {
    Serial.println("Error: MPU-6050 not found. Check wiring!");
    while (true) { delay(100); }
  }

  // Configure measurement ranges
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);   // ±8 g
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);         // ±500 °/s
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);      // Low-pass filter

  Serial.println("OK — reading sensor...");
  Serial.println();
}

void loop() {
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);

  // Acceleration (m/s²)
  Serial.print("Accel X: "); Serial.print(accel.acceleration.x, 2);
  Serial.print("  Y: ");      Serial.print(accel.acceleration.y, 2);
  Serial.print("  Z: ");      Serial.print(accel.acceleration.z, 2);
  Serial.println(" m/s²");

  // Gyroscope (°/s)
  Serial.print("Gyro  X: "); Serial.print(gyro.gyro.x * 180.0f / M_PI, 2);
  Serial.print("  Y: ");      Serial.print(gyro.gyro.y * 180.0f / M_PI, 2);
  Serial.print("  Z: ");      Serial.print(gyro.gyro.z * 180.0f / M_PI, 2);
  Serial.println(" deg/s");

  // Temperature (°C)
  Serial.print("Temp:    "); Serial.print(temp.temperature, 1); Serial.println(" C");
  Serial.println();

  delay(500);
}
