/*
  Dot Matrix RGB Custom (24x8) — Spectrum Equalizer Bars
  Adjust NUM_COLS and NUM_ROWS to match the Width (cols) and Height (rows)
  configured in the Properties panel.
*/
#define FASTLED_INTERNAL
#include <FastLED.h>

#define LED_PIN     3
#define COLOR_ORDER GRB
#define CHIPSET     WS2812B
#define NUM_COLS    24
#define NUM_ROWS    8
#define NUM_LEDS    (NUM_COLS * NUM_ROWS)
#define BRIGHTNESS  230

CRGB leds[NUM_LEDS];
uint8_t peakLevel[NUM_COLS];

uint16_t XY(uint8_t x, uint8_t y) {
  return (uint16_t)y * NUM_COLS + x;
}

void setup() {
  FastLED.addLeds<CHIPSET, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
    .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  uint16_t t = millis() / 20;

  for (uint8_t x = 0; x < NUM_COLS; x++) {
    uint8_t levelRaw = sin8(x * 19 + t * 2) + sin8(x * 7 - t * 3);
    uint8_t level = scale8(levelRaw, NUM_ROWS);
    if (level == 0) {
      level = 1;
    }

    if (level >= peakLevel[x]) {
      peakLevel[x] = level;
    } else if ((t % 4 == 0) && peakLevel[x] > 0) {
      peakLevel[x]--;
    }

    uint8_t baseHue = (x * 255) / NUM_COLS + (t / 2);

    for (uint8_t y = 0; y < NUM_ROWS; y++) {
      uint8_t rowFromBottom = (NUM_ROWS - 1) - y;
      if (rowFromBottom < level) {
        uint8_t brightness = 150 + (rowFromBottom * 105) / NUM_ROWS;
        leds[XY(x, y)] = CHSV(baseHue + rowFromBottom * 8, 240, brightness);
      } else if (rowFromBottom == peakLevel[x]) {
        leds[XY(x, y)] = CRGB(255, 255, 255);
      } else {
        leds[XY(x, y)] = CRGB::Black;
      }
    }
  }

  FastLED.show();
  FastLED.delay(18);
}
