/*
  Heart Beat Sensor — BPM Calculator
  Reads an analog pulse sensor on A0, detects rising peaks, and calculates
  approximate heart rate in beats per minute (BPM).

  Wiring:
    VCC -> 5V
    GND -> GND
    SIG -> A0

  Note: The signal oscillates between ~300 (no pulse) and ~700 (blood vessel peak).
  Place your fingertip firmly over the sensor for best readings.
*/

const int  SENSOR_PIN   = A0;    // Analog input from pulse sensor
const int  THRESHOLD    = 550;   // ADC level that indicates a heartbeat peak
const long DEBOUNCE_MS  = 400;   // Minimum ms between two valid beats

unsigned long lastBeatTime = 0;  // Timestamp of the previous beat (ms)
bool          aboveThreshold = false; // Tracks whether we are in the high phase

void setup() {
  Serial.begin(9600);
  Serial.println("Heart Beat Sensor Demo");
  Serial.println("Place your finger on the sensor...");
}

void loop() {
  int raw = analogRead(SENSOR_PIN);

  // Detect rising edge: signal crosses threshold upward
  if (raw > THRESHOLD && !aboveThreshold) {
    aboveThreshold = true;

    unsigned long now  = millis();
    unsigned long diff = now - lastBeatTime;

    if (diff > DEBOUNCE_MS) { // Debounce to avoid noise spikes
      int bpm = (int)(60000UL / diff); // Beats per minute

      Serial.print("Beat detected! BPM: ");
      Serial.print(bpm);
      Serial.print("  Raw: ");
      Serial.println(raw);

      lastBeatTime = now;
    }
  } else if (raw < THRESHOLD) {
    aboveThreshold = false; // Signal fell below threshold — ready for next beat
  }

  delay(10); // Sample at ~100 Hz
}
