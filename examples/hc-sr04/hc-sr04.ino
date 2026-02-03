/*
  HC-SR04 Ultrasonic Distance Sensor
  Triggers a 10 µs pulse on the TRIG pin, then measures the duration of the
  ECHO pulse to calculate the round-trip distance in centimeters.

  Wiring:
    VCC  -> 5V
    GND  -> GND
    TRIG -> Pin 9
    ECHO -> Pin 8
*/

const int TRIG_PIN = 9; // Trigger output
const int ECHO_PIN = 8; // Echo input

// Speed of sound in air at ~20 °C: 343 m/s = 0.0343 cm/µs
// Round-trip: divide by 2
const float SOUND_SPEED_CM_US = 0.0343f / 2.0f;

// Maximum measurable distance (cm) and corresponding timeout (µs)
const long TIMEOUT_US = 30000UL; // ~515 cm max range

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  Serial.begin(9600);
  Serial.println("HC-SR04 Ultrasonic Demo");
}

float measureDistanceCm() {
  // Ensure trigger is LOW before sending pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  // Send 10 µs HIGH pulse to trigger measurement
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Measure echo pulse duration in microseconds
  long duration = pulseIn(ECHO_PIN, HIGH, TIMEOUT_US);

  if (duration == 0) {
    return -1.0f; // Timeout: object out of range
  }

  return (float)duration * SOUND_SPEED_CM_US;
}

void loop() {
  float distance = measureDistanceCm();

  if (distance < 0) {
    Serial.println("Distance: Out of range");
  } else {
    Serial.print("Distance: ");
    Serial.print(distance, 1);
    Serial.println(" cm");
  }

  delay(250);
}
