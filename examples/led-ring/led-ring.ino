/*
  LED Ring Comet
  Spins a bright comet with a fading tail around a 16-pixel NeoPixel ring.
  Each full rotation also advances the rainbow hue.

  Wiring:
    Pin 6 -> LED Ring DIN
    5V    -> LED Ring VDD
    GND   -> LED Ring VSS

  Library: FastLED >= 3.6
*/

#define FASTLED_INTERNAL
#include <FastLED.h>

#define DATA_PIN    6   // Data pin connected to ring DIN
#define NUM_LEDS    16  // Number of pixels on the ring
#define BRIGHTNESS  80  // Overall brightness (0-255)
#define TAIL_LENGTH 5   // How many pixels form the fading tail

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}

void loop() {
  static uint8_t head = 0;   // Current comet head position
  static uint8_t hue  = 0;   // Rainbow offset

  // Fade all pixels toward black
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i].fadeToBlackBy(180);
  }

  // Draw tail behind the head
  for (int t = 0; t < TAIL_LENGTH; t++) {
    int pos = (head - t + NUM_LEDS) % NUM_LEDS;
    uint8_t brightness = 255 - (t * (255 / TAIL_LENGTH));
    leds[pos] = CHSV(hue, 255, brightness);
  }

  FastLED.show();
  delay(40);

  head++;
  if (head >= NUM_LEDS) {
    head = 0;
    hue += 16; // Shift hue after each full revolution
  }
}
