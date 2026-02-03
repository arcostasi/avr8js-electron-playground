/*
  KY-040 Rotary Encoder
  Reads rotation direction and click count using interrupt-driven decoding.
  Also detects a push-button press on the encoder shaft.

  Wiring:
    +   -> 5V
    GND -> GND
    CLK -> Pin 2 (INT0 — hardware interrupt)
    DT  -> Pin 3
    SW  -> Pin 4 (push-button, INPUT_PULLUP)
*/

const int PIN_CLK = 2; // Clock — connected to INT0 for interrupt-driven decoding
const int PIN_DT  = 3; // Data  — read inside ISR to determine direction
const int PIN_SW  = 4; // Push-button (active-LOW, internal pull-up)

volatile int encoderCount = 0; // Current position counter (modified in ISR)
volatile int lastClk = HIGH;   // Last CLK state

// Interrupt Service Routine: called on each falling edge of CLK
void encoderISR() {
  int clkState = digitalRead(PIN_CLK);
  if (clkState != lastClk && clkState == LOW) {
    // DT LOW  at falling CLK edge -> counter-clockwise
    // DT HIGH at falling CLK edge -> clockwise
    if (digitalRead(PIN_DT) == HIGH) {
      encoderCount++;
    } else {
      encoderCount--;
    }
  }
  lastClk = clkState;
}

void setup() {
  pinMode(PIN_CLK, INPUT);
  pinMode(PIN_DT,  INPUT);
  pinMode(PIN_SW,  INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_CLK), encoderISR, CHANGE);
  Serial.begin(9600);
  Serial.println("KY-040 Rotary Encoder Demo");
}

void loop() {
  // Safely read the volatile counter
  noInterrupts();
  int count = encoderCount;
  interrupts();

  bool pressed = (digitalRead(PIN_SW) == LOW);

  Serial.print("Count: ");
  Serial.print(count);
  if (pressed) {
    Serial.print("  [BUTTON]");
  }
  Serial.println();

  delay(100);
}
