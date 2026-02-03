/*
  NeoPixel Hue Cycle
  Smoothly cycles a single WS2812B NeoPixel through the full color spectrum
  using FastLED's HSV color model.

  Wiring:
    Pin 6 -> NeoPixel DIN (data pin)
    5V    -> NeoPixel VDD
    GND   -> NeoPixel VSS

  Library: FastLED >= 3.6
*/

#define FASTLED_INTERNAL // Suppress FastLED pragma/version messages
#include <FastLED.h>

#define DATA_PIN   6   // Data pin connected to NeoPixel DIN
#define NUM_LEDS   1   // Single NeoPixel
#define BRIGHTNESS 64  // 0-255; keep low to reduce current draw

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
  Serial.begin(9600);
  Serial.println("NeoPixel Hue Cycle Demo");
}

void loop() {
  // Increment hue each frame to create a smooth rainbow effect
  static uint8_t hue = 0;
  leds[0] = CHSV(hue, 255, 255); // Full saturation and value
  FastLED.show();

  Serial.print("Hue: ");
  Serial.println(hue);

  hue++;         // Wraps automatically at 256
  delay(10);     // ~100 full cycles per second
}
