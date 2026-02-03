/*
  Hello World — LCD1602 I2C
  Displays a scrolling message on a 16x2 I2C LCD.
  A custom heart character is defined in CGRAM.

  Wiring (I2C backpack):
    SDA -> A4
    SCL -> A5
    VCC -> 5V
    GND -> GND

  Library: LiquidCrystal_I2C by Frank de Brabander
*/
#include <LiquidCrystal_I2C.h>

// LCD I2C address 0x27, 16 columns, 2 rows
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Custom heart character bitmap (8 rows x 5 cols)
byte heart[8] = {
  0b00000,
  0b01010,
  0b11111,
  0b11111,
  0b11111,
  0b01110,
  0b00100,
  0b00000,
};

void setup() {
  lcd.init();
  lcd.backlight();

  // Store heart in custom character slot 3
  lcd.createChar(3, heart);

  // Print static greeting on row 0
  lcd.setCursor(2, 0);
  lcd.print("Hello World!");
  lcd.blink();
}

int charIndex = 0;
// Use \x03 to reference custom heart char; \xaf is a right-arrow glyph
const char *msg = "I \x03 Wokwi \xaf";

void loop() {
  // Reveal one character of msg per tick on row 1
  if (charIndex < (int)strlen(msg)) {
    lcd.setCursor(charIndex + 2, 1);
    lcd.print(msg[charIndex]);
    charIndex++;
  }
  delay(200);
}
