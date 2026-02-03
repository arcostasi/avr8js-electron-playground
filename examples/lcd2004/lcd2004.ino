/*
  LCD 2004 (I2C)
  ==============
  Demonstrates a 20×4 character LCD display driven over I2C.
  The display shows a static title, a real-time counter, and
  a scrolling message across the bottom two rows.

  Wiring (I2C backpack):
    LCD VCC → Arduino 5V
    LCD GND → Arduino GND
    LCD SDA → Arduino A4
    LCD SCL → Arduino A5

  Library: LiquidCrystal_I2C by Frank de Brabander
    Arduino IDE: Sketch → Include Library → Manage Libraries
    Search: "LiquidCrystal I2C" by Frank de Brabander  (version ≥ 1.1.2)
*/

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ----- Display configuration -----
// Address 0x27 is the most common default for PCF8574-based backpacks.
// Use an I2C scanner sketch if the display does not respond.
const uint8_t LCD_ADDRESS = 0x27;
const uint8_t LCD_COLS    = 20;
const uint8_t LCD_ROWS    = 4;

LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);

// ----- Custom character: musical note (row 0 = top) -----
byte noteChar[8] = {
  0b00100,
  0b00110,
  0b00101,
  0b00100,
  0b01100,
  0b11100,
  0b01100,
  0b00000
};

// ----- Scrolling message (rows 2–3) -----
const char SCROLL_MSG[] = "  ** avr8js-electron **  Wokwi Simulator  ";
const int  SCROLL_LEN   = (int)sizeof(SCROLL_MSG) - 1; // exclude null terminator
int scrollOffset = 0;

// ----- Timing -----
unsigned long lastCounterUpdate = 0;
unsigned long lastScrollUpdate  = 0;
const unsigned long COUNTER_INTERVAL_MS = 1000;
const unsigned long SCROLL_INTERVAL_MS  =  300;

unsigned long elapsedSeconds = 0;


void setup() {
  lcd.init();
  lcd.createChar(0, noteChar);
  lcd.backlight();

  // --- Row 0: title ---
  lcd.setCursor(0, 0);
  lcd.write((uint8_t)0);               // musical note custom char
  lcd.print(" LCD 2004 Demo      ");

  // --- Row 1: static labels ---
  lcd.setCursor(0, 1);
  lcd.print("Uptime:    0 s      ");

  // Rows 2–3 will be written by the scroll animation
}


void loop() {
  unsigned long now = millis();

  // --- Update uptime counter (row 1) every second ---
  if (now - lastCounterUpdate >= COUNTER_INTERVAL_MS) {
    lastCounterUpdate = now;
    elapsedSeconds++;

    lcd.setCursor(8, 1);
    // Right-align in a 6-character field
    char buf[8];
    snprintf(buf, sizeof(buf), "%6lu", elapsedSeconds);
    lcd.print(buf);
    lcd.print(" s");
  }

  // --- Scroll the message across rows 2 and 3 ---
  if (now - lastScrollUpdate >= SCROLL_INTERVAL_MS) {
    lastScrollUpdate = now;

    // Print LCD_COLS characters starting at scrollOffset (wraps with modulo)
    for (int col = 0; col < LCD_COLS; col++) {
      char ch = SCROLL_MSG[(scrollOffset + col) % SCROLL_LEN];
      lcd.setCursor(col, 2);
      lcd.print(ch);
    }

    // Bottom row: same message offset by 10 for a wave effect
    for (int col = 0; col < LCD_COLS; col++) {
      char ch = SCROLL_MSG[(scrollOffset + col + 10) % SCROLL_LEN];
      lcd.setCursor(col, 3);
      lcd.print(ch);
    }

    scrollOffset = (scrollOffset + 1) % SCROLL_LEN;
  }
}
