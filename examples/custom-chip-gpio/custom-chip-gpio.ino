/*
  Custom Chip GPIO Example

  1) Build custom chips (F6)
  2) Start simulation / compile sketch (F5)

  This sketch generates a FAST square wave on D2.
  The custom chip reads D2 and applies a debounce filter before toggling D8.
  Two LEDs show the raw input pulse and the debounced output mirror.
  Change "Debounce (ms)" in the Properties panel while running:
    - small values: D8 toggles often
    - large values: D8 toggles much less
*/

const uint8_t INPA = 8;
const uint8_t OUTB = 2;
const uint8_t RAW_LED = 2;
const uint8_t MIRROR_LED = 9;
const uint16_t HIGH_MS = 70;
const uint16_t LOW_MS = 70;

uint32_t samples = 0;

void setup() {
  Serial.begin(115200);
  pinMode(OUTB, OUTPUT);
  pinMode(INPA, INPUT);
  pinMode(MIRROR_LED, OUTPUT);
}

void loop() {
  digitalWrite(OUTB, HIGH);
  delay(HIGH_MS);

  digitalWrite(OUTB, LOW);
  delay(LOW_MS);

  // Reduce terminal noise: print every 5 cycles.
  samples++;
  digitalWrite(MIRROR_LED, digitalRead(INPA));
  if (samples % 5 == 0) {
    Serial.print("IN=2 OUT=8 VAL=");
    Serial.println(digitalRead(INPA));
  }
}
