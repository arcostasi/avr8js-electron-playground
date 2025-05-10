/*
  Custom Chip Attributes API Example
  1) Build chips (F6)
  2) Run simulation (F5)

  Edit chip attrs in diagram.json:
    blinkMs
    dutyPercent

  The custom chip output is mirrored to an external LED on D9.
*/

const uint8_t CHIP_OUT = 8;
const uint8_t MIRROR_LED = 9;
unsigned long lastLog = 0;

void setup() {
  Serial.begin(115200);
  pinMode(CHIP_OUT, INPUT);
  pinMode(MIRROR_LED, OUTPUT);
}

void loop() {
  int chipValue = digitalRead(CHIP_OUT);
  digitalWrite(MIRROR_LED, chipValue);

  if (millis() - lastLog >= 200) {
    lastLog = millis();
    Serial.print("OUT=");
    Serial.println(chipValue);
  }
}
