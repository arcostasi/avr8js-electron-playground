#include <SPI.h>
#include "FastLED.h"

// Matrix size
#define NUM_ROWS 16
#define NUM_COLS 16
#define NUM_LEDS NUM_ROWS * NUM_COLS

// LEDs pin
#define DATA_PIN 3

// LED brightness
#define BRIGHTNESS 180

// Define the array of leds
CRGB rgbLeds[NUM_LEDS];

int animate = 0;

// The setup function runs once when you press reset or power the board
void setup() {
  SPI.begin();
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(rgbLeds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

// The loop function runs over and over again forever
void loop() {
  for (byte row = 0; row < NUM_ROWS; row++) {
    for (byte col = 0; col < NUM_COLS; col++) {
      int delta = abs(NUM_ROWS - row * 2) + abs(NUM_COLS - col * 2);
      rgbLeds[row * NUM_COLS + col] = CHSV(delta * 4 + animate, 255, 255);
    }
  }

  FastLED.show();

  delay(3);
  animate++;
}
