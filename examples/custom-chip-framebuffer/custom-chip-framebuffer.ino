/*
  Custom Chip Framebuffer Scroll Text Demo

  This example renders the animation inside a custom chip framebuffer:
    - custom-chip-framebuffer.chip.c
    - custom-chip-framebuffer.chip.json

  Steps:
    1) Press F6 (Build Custom Chips)
    2) Press F5 (Compile/Run)

  The UNO sketch is intentionally minimal. The visual output appears on
  the chip part "chip-custom-chip-framebuffer" in diagram.json.
*/

void setup() {
  Serial.begin(115200);
  Serial.println("Custom chip framebuffer demo ready.");
  Serial.println("Build chips (F6), then run (F5).");
}

void loop() {
  delay(1000);
}
