/*
  ILI9341 TFT Display
  ====================
  Demonstrates the 320×240 color TFT display (ILI9341) driven over SPI.
  Draws filled rectangles, circles, text in multiple colors, and runs a
  simple animated color-bar demo to exercise the full display.

  Wiring (hardware SPI):
    TFT VCC  → Arduino 5V
    TFT GND  → Arduino GND
    TFT CS   → Arduino pin 10
    TFT RST  → Arduino pin 8
    TFT DC   → Arduino pin 9
    TFT MOSI → Arduino pin 11  (SPI MOSI)
    TFT SCK  → Arduino pin 13  (SPI SCK)
    TFT MISO → Arduino pin 12  (SPI MISO — optional, unused for write-only)

  Libraries:
    - Adafruit ILI9341  (Sketch → Library Manager → "Adafruit ILI9341" ≥ 1.5.10)
    - Adafruit GFX Library (auto-installed as dependency)
    - SPI (built-in)
*/

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

// ----- Pin definitions -----
const int TFT_CS  = 10;
const int TFT_RST = 8;
const int TFT_DC  = 9;

Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

// ----- Display dimensions -----
const int SCREEN_W = 320;
const int SCREEN_H = 240;

// ----- Animation state -----
int barOffset = 0;


// Draw the static UI elements (called once)
void drawStaticUI() {
  tft.fillScreen(ILI9341_BLACK);

  // Title banner
  tft.fillRect(0, 0, SCREEN_W, 34, ILI9341_NAVY);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(4, 8);
  tft.print("avr8js  ILI9341 Demo");

  // Horizontal divider
  tft.drawFastHLine(0, 35, SCREEN_W, ILI9341_WHITE);

  // Colored shapes section
  // Filled circles
  tft.fillCircle(40,  90, 28, ILI9341_RED);
  tft.fillCircle(110, 90, 28, ILI9341_GREEN);
  tft.fillCircle(180, 90, 28, ILI9341_BLUE);
  tft.fillCircle(250, 90, 28, ILI9341_YELLOW);

  // Rounded rectangles
  tft.drawRoundRect(10,  128, 70, 40, 8, ILI9341_CYAN);
  tft.drawRoundRect(90,  128, 70, 40, 8, ILI9341_MAGENTA);
  tft.drawRoundRect(170, 128, 70, 40, 8, ILI9341_ORANGE);
  tft.drawRoundRect(250, 128, 60, 40, 8, ILI9341_WHITE);

  // Labels under rectangles
  tft.setTextSize(1);
  tft.setTextColor(ILI9341_CYAN);
  tft.setCursor(18, 175);
  tft.print("CYAN");

  tft.setTextColor(ILI9341_MAGENTA);
  tft.setCursor(95, 175);
  tft.print("MAGENTA");

  tft.setTextColor(ILI9341_ORANGE);
  tft.setCursor(178, 175);
  tft.print("ORANGE");

  tft.setTextColor(ILI9341_WHITE);
  tft.setCursor(258, 175);
  tft.print("WHITE");

  // Separator
  tft.drawFastHLine(0, 190, SCREEN_W, ILI9341_DARKGREY);

  // Static footer label
  tft.setTextColor(ILI9341_LIGHTGREY);
  tft.setTextSize(1);
  tft.setCursor(4, 228);
  tft.print("Scrolling color bar ->");
}


// Draw one frame of the animated color bar (bottom strip)
void drawColorBar() {
  const int BAR_Y = 196;
  const int BAR_H = 30;

  for (int x = 0; x < SCREEN_W; x++) {
    // Map x + offset to a hue in the 0-767 range (RGB cycle)
    int hue = ((x + barOffset) * 3) % 768;
    uint16_t color;

    if (hue < 256) {
      // Red → Yellow
      color = tft.color565((uint8_t)(255 - hue), (uint8_t)hue, 0);
    } else if (hue < 512) {
      // Yellow → Cyan
      color = tft.color565(0, (uint8_t)(255 - (hue - 256)), (uint8_t)(hue - 256));
    } else {
      // Cyan → Red
      color = tft.color565((uint8_t)(hue - 512), 0, (uint8_t)(255 - (hue - 512)));
    }

    tft.drawFastVLine(x, BAR_Y, BAR_H, color);
  }

  barOffset = (barOffset + 4) % 256;
}


void setup() {
  Serial.begin(9600);
  Serial.println("ILI9341 TFT initializing...");

  tft.begin();
  tft.setRotation(1);  // Landscape: 320 wide × 240 tall

  Serial.print("Display size: ");
  Serial.print(tft.width());
  Serial.print(" x ");
  Serial.println(tft.height());

  drawStaticUI();
  Serial.println("Static UI drawn. Starting animation loop.");
}


void loop() {
  drawColorBar();
  delay(30);  // ~33 fps target
}
