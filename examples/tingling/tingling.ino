/**
 * Soulmate Tutorial
 * https://editor.soulmatelights.com/tutorial
 * Copyright (C) 2020, Soulmate
 */

#include "FastLED.h"

// Matrix size
#define NUM_ROWS 16
#define NUM_COLS 16

// LEDs pin
#define DATA_PIN 3

// LED brightness
#define BRIGHTNESS 180

#define NUM_LEDS (NUM_ROWS * NUM_COLS)

// Define the array of leds
CRGB leds[NUM_LEDS];

int offset = 0;
int hue = 50;

void setup() {
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  draw();
  FastLED.show();
  delay(5);
}

void draw() {
  // 6 beats per minute, between 1 and 10
  int numberOfSparkles = beatsin16(6, 1, 10);

  EVERY_N_MILLISECONDS(20) {
    for (int i = 0; i < numberOfSparkles; i++) {
      int pos = random16(NUM_LEDS);

      if (!leds[pos]) {
        leds[pos] = CHSV(hue + (pos / 10), 255, 255);
      }
    }
  }

  EVERY_N_MILLISECONDS(40) {
    hue -= 1;
  }

  fade_raw(leds, NUM_LEDS, 4);
}
