#define FASTLED_INTERNAL
#include <FastLED.h>

#define LED_PIN  3
#define LED_ROWS 16
#define LED_COLS 16

#define LED_TYPE WS2811
#define COLOR_ORDER GRB

#define NUM_LEDS (LED_ROWS * LED_COLS)

CRGBArray<NUM_LEDS> leds;

void setup()
{
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
  .setCorrection(TypicalLEDStrip);
}

void loop()
{
  static uint8_t hue;

  for (int i = 0; i < NUM_LEDS / 2; i++) {
    // Fade everything out
    leds.fadeToBlackBy(40);

    // Set an LED value
    leds[i] = CHSV(hue++, 255, 255);

    // Scrolling the LEDs
    leds(NUM_LEDS / 2, NUM_LEDS - 1) = leds(NUM_LEDS / 2 - 1, 0);
    FastLED.delay(33);
  }
}

// Trivial XY function for the 8x8 matrix
uint16_t XY(uint8_t x, uint8_t y)
{
  return (y * LED_COLS) + x;
}
