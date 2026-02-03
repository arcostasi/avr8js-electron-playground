/*
  Metaballs
  16x16 RGB LED matrix demo
  by Yaroslaw Turbin 02.09.2020
  https://vk.com/ldirko
  https://www.reddit.com/user/ldirko/
*/
#define FASTLED_INTERNAL
#include <FastLED.h>

// Matrix size
#define NUM_ROWS 16
#define NUM_COLS 16

// LEDs pin
#define DATA_PIN 3

// LED brightness
#define BRIGHTNESS 255
#define NUM_LEDS NUM_ROWS * NUM_COLS

// Define the array of leds
CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {

  uint8_t bx1 = beatsin8(15, 0, NUM_COLS - 1, 0, 0);
  uint8_t by1 = beatsin8(18, 0, NUM_ROWS - 1, 0, 0);
  uint8_t bx2 = beatsin8(28, 0, NUM_COLS - 1, 0, 32);
  uint8_t by2 = beatsin8(23, 0, NUM_ROWS - 1, 0, 32);
  uint8_t bx3 = beatsin8(30, 0, NUM_COLS - 1, 0, 64);
  uint8_t by3 = beatsin8(24, 0, NUM_ROWS - 1, 0, 64);
  uint8_t bx4 = beatsin8(17, 0, NUM_COLS - 1, 0, 128);
  uint8_t by4 = beatsin8(25, 0, NUM_ROWS - 1, 0, 128);
  uint8_t bx5 = beatsin8(19, 0, NUM_COLS - 1, 0, 170);
  uint8_t by5 = beatsin8(21, 0, NUM_ROWS - 1, 0, 170);

  for (int i = 0; i < NUM_COLS; i++) {
    for (int j = 0; j < NUM_ROWS; j++) {

      byte  sum =  dist(i, j, bx1, by1);
      sum = qadd8(sum, dist(i, j, bx2, by2));
      sum = qadd8(sum, dist(i, j, bx3, by3));
      sum = qadd8(sum, dist(i, j, bx4, by4));
      sum = qadd8(sum, dist(i, j, bx5, by5));

      leds[XY (i, j)] = ColorFromPalette(HeatColors_p, sum + 220, BRIGHTNESS);
    }
  }

  blur2d(leds, NUM_COLS, NUM_ROWS, 32 );
  FastLED.show();

}

byte dist (uint8_t x1, uint8_t y1, uint8_t x2, uint8_t y2) {
  int a = y2 - y1;
  int b = x2 - x1;
  a *= a;
  b *= b;
  byte dist = 220 / sqrt16(a + b);
  return dist;
}

uint16_t XY (uint8_t x, uint8_t y) {
  return (y * NUM_COLS + x);
}
