/*
  Custom Chip Time API Example
  1) Build chips (F6)
  2) Run simulation (F5)

  The TICK output is mirrored to a visible LED on D9.
*/

const uint8_t CHIP_TICK = 8;
const uint8_t MIRROR_LED = 9;
int lastState = -1;

void setup() {
  Serial.begin(115200);
  pinMode(CHIP_TICK, INPUT);
  pinMode(MIRROR_LED, OUTPUT);
}

void loop() {
  int s = digitalRead(CHIP_TICK);
  digitalWrite(MIRROR_LED, s);
  if (s != lastState) {
    lastState = s;
    Serial.print("TICK=");
    Serial.print(s);
    Serial.print(" at ms=");
    Serial.println(millis());
  }
}
