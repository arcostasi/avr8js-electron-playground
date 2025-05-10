/*
  Custom Chip UART API Example
  1) Build chips (F6)
  2) Run simulation (F5)

  The chip sends UART text to Serial Monitor via UNO RX/TX pins.
  The low nibble of each incoming byte is also rendered on a 7-segment display.
*/

const uint8_t SEG_PINS[7] = { 2, 3, 4, 5, 6, 7, 8 };
const uint8_t DIGIT_MASKS[16][7] = {
  { 1, 1, 1, 1, 1, 1, 0 },
  { 0, 1, 1, 0, 0, 0, 0 },
  { 1, 1, 0, 1, 1, 0, 1 },
  { 1, 1, 1, 1, 0, 0, 1 },
  { 0, 1, 1, 0, 0, 1, 1 },
  { 1, 0, 1, 1, 0, 1, 1 },
  { 1, 0, 1, 1, 1, 1, 1 },
  { 1, 1, 1, 0, 0, 0, 0 },
  { 1, 1, 1, 1, 1, 1, 1 },
  { 1, 1, 1, 1, 0, 1, 1 },
  { 1, 1, 1, 0, 1, 1, 1 },
  { 0, 0, 1, 1, 1, 1, 1 },
  { 1, 0, 0, 1, 1, 1, 0 },
  { 0, 1, 1, 1, 1, 0, 1 },
  { 1, 0, 0, 1, 1, 1, 1 },
  { 1, 0, 0, 0, 1, 1, 1 }
};

void renderHexNibble(uint8_t nibble) {
  nibble &= 0x0F;
  for (uint8_t i = 0; i < 7; i++) {
    digitalWrite(SEG_PINS[i], DIGIT_MASKS[nibble][i] ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("UART bridge demo started.");
  for (uint8_t i = 0; i < 7; i++) {
    pinMode(SEG_PINS[i], OUTPUT);
  }
  renderHexNibble(0);
}

void loop() {
  while (Serial.available() > 0) {
    int incoming = Serial.read();
    if (incoming >= 0) {
      renderHexNibble((uint8_t)incoming);
      Serial.print("UART byte=0x");
      if (incoming < 16) Serial.print('0');
      Serial.println(incoming, HEX);
    }
  }
}
