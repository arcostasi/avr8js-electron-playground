/*
  SquareSwirl
  FasLED 3.1 "2-D blur" demo on 8x8 matrix
  by Mark Kriegsman
  https://gist.github.com/kriegsman
*/
#define FASTLED_INTERNAL
#include <FastLED.h>

#define LED_PIN     3
#define LED_TYPE    WS2811
#define COLOR_ORDER GRB
#define BRIGHTNESS  255

const uint8_t kSquareWidth = 8;
const uint8_t kSquareHeight = 8;
const uint8_t kBorderWidth = 1;

#define NUM_LEDS    (kSquareWidth * kSquareHeight)

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<LED_TYPE, LED_PIN,
    COLOR_ORDER>(leds, NUM_LEDS)
    .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  // Apply some blurring to whatever's
  // already on the matrix
  // Note that we never actually clear the matrix,
  // we just constantly blur it repeatedly.
  // Since the blurring is 'lossy',
  // there's an automatic trend toward black.
  uint8_t blurAmount = dim8_raw(
      beatsin8(3, 64, 192));

  blur2d(leds, kSquareWidth, kSquareWidth,
      blurAmount);

  // Use two out-of-sync sine waves
  uint8_t  i = beatsin8( 91, kBorderWidth,
      kSquareWidth - kBorderWidth);
  uint8_t  j = beatsin8(109, kBorderWidth,
      kSquareWidth - kBorderWidth);
  uint8_t  k = beatsin8( 73, kBorderWidth,
      kSquareWidth - kBorderWidth);

  // The color of each point shifts over time,
  // each at a different speed.
  uint16_t ms = millis();
  leds[XY(i, j)] += CHSV(ms / 29, 200, 255);
  leds[XY(j, k)] += CHSV(ms / 41, 200, 255);
  leds[XY(k, i)] += CHSV(ms / 73, 200, 255);

  FastLED.show();
}

// Trivial XY function for the 8x8 grid;
// use a different XY function for
// different matrix grids.
uint16_t XY(uint8_t x, uint8_t y) {
  return (y * kSquareWidth) + x;
}
