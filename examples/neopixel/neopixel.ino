/**
 * This 16x16 NeoPixel matrix is connected to Arduino's
 * digital pin number 3. It has total of 256 LEDs.
 * Part of Wokwi Playground
 * https://wokwi.com/playground/neopixel-matrix
 * Copyright (C) 2020, Uri Shaked
 */

#include "FastLED.h"

// Matrix size
#define NUM_ROWS 16
#define NUM_COLS 16

// LEDs pin
#define DATA_PIN 3

// LED brightness
#define BRIGHTNESS 180

#define NUM_LEDS NUM_ROWS * NUM_COLS

// Define the array of leds
CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

int counter = 0;

void loop() {
  for (byte row = 0; row < NUM_ROWS; row++) {
    for (byte col = 0; col < NUM_COLS; col++) {
      int delta = abs(NUM_ROWS - row * 2) + abs(NUM_COLS - col * 2);
      leds[row * NUM_COLS + col] = CHSV(delta * 4 + counter, 255, 255);
    }
  }

  FastLED.show();
  delay(5);

  counter++;
}
