/*
  Rotary Dialer
  =============
  Reads pulses from a vintage rotary telephone dial connected to pin 2
  and prints the dialed digit to the Serial Monitor.

  Wiring:
    Rotary Dialer PULSE → Arduino pin 2 (interrupt)
    Rotary Dialer GND   → Arduino GND

  How it works:
    - Each digit N on the dial produces N falling-edge pulses.
    - Digit "0" produces 10 pulses.
    - A gap of >150 ms between pulses signals the end of a digit.
    - The ISR counts pulses; the main loop detects the gap and prints
      the result.

  Library: none (uses only built-in Arduino interrupt functions)
*/

// ----- Pin definitions -----
const int PULSE_PIN = 2;   // Must be an interrupt-capable pin (pin 2 = INT0)

// ----- State (shared with ISR — must be volatile) -----
volatile int pulseCount = 0;
volatile unsigned long lastPulseTime = 0;

// ----- Timeout after which a completed digit is declared (ms) -----
const unsigned long DIGIT_TIMEOUT_MS = 200;

// ----- Flag so we only report a digit once -----
bool digitReported = true;


// ISR: called on every falling edge from the dial
void pulseISR() {
  pulseCount++;
  lastPulseTime = millis();
  digitReported = false;
}


void setup() {
  Serial.begin(9600);
  Serial.println("Rotary Dialer ready — pick up and dial!");

  pinMode(PULSE_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PULSE_PIN), pulseISR, FALLING);
}


void loop() {
  // Wait for the timeout to confirm the digit is complete
  if (!digitReported && (millis() - lastPulseTime >= DIGIT_TIMEOUT_MS)) {
    // Disable interrupts while reading volatile variables
    noInterrupts();
    int count = pulseCount;
    pulseCount = 0;
    interrupts();

    // 10 pulses = digit 0
    int digit = (count % 10);

    if (count > 0) {
      Serial.print("Dialed digit: ");
      Serial.println(digit);
    }

    digitReported = true;
  }
}
