/*
  Dot Matrix RGB 16x16 — Plasma Ripple Demo
  Designed for the customizable dot-matrix-react component driven by AVR8js WS2812Controller.
*/
#define FASTLED_INTERNAL
#include <FastLED.h>

#define LED_PIN     3
#define NUM_COLS    16
#define NUM_ROWS    16
#define NUM_LEDS    (NUM_COLS * NUM_ROWS)
#define BRIGHTNESS  255

CRGB leds[NUM_LEDS];

uint16_t XY(uint8_t x, uint8_t y) {
  return (uint16_t)y * NUM_COLS + x;
}

void setup() {
  FastLED.addLeds<NEOPIXEL, LED_PIN>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  uint16_t t = millis() / 16;
  uint8_t cx = beatsin8(13, 2, NUM_COLS - 3);
  uint8_t cy = beatsin8(17, 2, NUM_ROWS - 3);

  for (uint8_t y = 0; y < NUM_ROWS; y++) {
    for (uint8_t x = 0; x < NUM_COLS; x++) {
      int8_t dx = (int8_t)x - (int8_t)cx;
      int8_t dy = (int8_t)y - (int8_t)cy;
      uint8_t dist = sqrt16((uint16_t)(dx * dx + dy * dy));

      uint8_t wave = sin8(x * 18 + t) + sin8(y * 22 - t) + sin8(dist * 28 - t * 2);
      uint8_t hue = wave + (t / 2);
      uint8_t level = sin8(wave);
      uint8_t val = level > 96 ? 255 : (level > 56 ? (level - 56) * 6 : 0);

      leds[XY(x, y)] = val > 0
        ? ColorFromPalette(RainbowColors_p, hue, val, LINEARBLEND)
        : CRGB::Black;
    }
  }

  FastLED.show();
  FastLED.delay(16);
}
