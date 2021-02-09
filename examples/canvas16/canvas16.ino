#include <FastLED.h>

#define PIN_DATA   3
#define LED_TYPE   WS2812B

#define LED_ROWS   16
#define LED_COLS   16
#define NUM_LEDS   LED_ROWS * LED_COLS

#define FRAME_MS   60
#define BRIGHTNESS 255

CRGB leds[NUM_LEDS];

uint8_t hue = 0;

void setup()
{
  FastLED.addLeds<LED_TYPE, PIN_DATA, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop()
{
  for (uint16_t i = 0; i < NUM_LEDS; i++)
  {
    leds[i] = CHSV(hue, 255, 255);
    FastLED.show();
    hue++;
    FastLED.delay(1000 / FRAME_MS);
  }
  for (uint16_t i = NUM_LEDS; i > 0; i--)
  {
    leds[i] = CRGB::Black;
    FastLED.show();
    FastLED.delay(1000 / FRAME_MS);
  }
}
