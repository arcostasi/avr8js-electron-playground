/**
 * Perlin noise fire procedure
 * 16x16 rgb led matrix demo
 * Yaroslaw Turbin, 01.09.2020
 * https://vk.com/ldirko
 * https://www.reddit.com/user/ldirko/
 * https://www.reddit.com/r/FastLED/comments/hgu16i/my_fire_effect_implementation_based_on_perlin/
 * speedup my old fire procedure https://pastebin.com/jSSVSRi6
 * idea is precalculate noise table in textrure,
 * then fake scroll it with shift offset
 * like in digital rain procedure https://pastebin.com/1yymjFxR
 */

#include "FastLED.h"

// Matrix size
#define NUM_ROWS 16
#define NUM_COLS 16
#define NUM_LEDS NUM_ROWS* NUM_COLS

// LEDs pin
#define DATA_PIN 3

// LED brightness
#define BRIGHTNESS 255

#define NOISE_HEIGHT NUM_COLS * 4

// Define the array of leds
CRGB leds[NUM_LEDS];

byte noises[NUM_COLS * NOISE_HEIGHT]; // Precalculated noise table
byte colorfade[NUM_ROWS]; // Simple colorfade table for speedup

DEFINE_GRADIENT_PALETTE(firepal) {
    // Define fire palette
    0, 0, 0, 0, // Black
    32, 255, 0, 0, // Red
    190, 255, 255, 0, // Yellow
    255, 255, 255, 255 // White
};

CRGBPalette16 myPal = firepal;
byte a = 0;

void setup()
{
    FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
    FastLED.setBrightness(BRIGHTNESS);

    for (int i = 0; i < NUM_COLS; i++) {
        for (int j = 0; j < (NOISE_HEIGHT); j++) {
            noises[j * NUM_COLS + i] = inoise8(i * 60, j * 60); // Init noise buffer
        }
    }

    for (int j = 0; j < NUM_ROWS; j++) {
        colorfade[j] = abs8(j - (NUM_ROWS - 1)) * 255 / (NUM_ROWS - 1); // Init colorfade table
    }

}

void loop()
{
    for (int i = 0; i < NUM_COLS; i++) {
        for (int j = 0; j < NUM_ROWS; j++) {
            int index = (j + a + random8(2)) % (NOISE_HEIGHT) * NUM_COLS; // Roll index in noise buffer
            leds[XY(i, j)] = ColorFromPalette(myPal, qsub8(noises[i + index], colorfade[j]), BRIGHTNESS);
        }
    }

    FastLED.delay(20);
    a++;
}

// Simple function to find led number in led matrix,
// change this to your routine
// or generate XY function for your matrix there:
// https://macetech.github.io/FastLED-XY-Map-Generator/
uint16_t XY(uint8_t x, uint8_t y)
{
    return (y * NUM_COLS + x);
}
