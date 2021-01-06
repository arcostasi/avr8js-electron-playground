/**
 * This example shows several ways to set up and
 * use 'palettes' of colors with FastLED.
 * https://github.com/FastLED/FastLED/examples/ColorPalette
 * Copyright (C) 2019, FastLED
 */

#include <FastLED.h>

#define LED_PIN     3
#define NUM_LEDS    256
#define BRIGHTNESS  128
#define LED_TYPE    WS2811
#define COLOR_ORDER GRB

CRGB leds[NUM_LEDS];

#define UPDATES_PER_SECOND 100

CRGBPalette16 currentPalette;
TBlendType    currentBlending;

extern CRGBPalette16 myRedWhiteBluePalette;
extern const TProgmemPalette16 myRedWhiteBluePalette_p PROGMEM;

void setup() {
  // delay(3000); // Power-up safety delay
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
    .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);

  currentPalette = RainbowColors_p;
  currentBlending = LINEARBLEND;
}

void loop()
{
  ChangePalettePeriodically();

  static uint8_t startIndex = 0;
  startIndex = startIndex + 1; // Motion speed

  FillLEDsFromPaletteColors( startIndex);

  FastLED.show();
  FastLED.delay(1000 / UPDATES_PER_SECOND);
}

void FillLEDsFromPaletteColors( uint8_t colorIndex)
{
  uint8_t brightness = 255;

  for ( int i = 0; i < NUM_LEDS; ++i) {
    leds[i] = ColorFromPalette( currentPalette, colorIndex,
      brightness, currentBlending);
    colorIndex += 3;
  }
}

// There are several different palettes of colors
// demonstrated here.
void ChangePalettePeriodically()
{
  uint8_t secondHand = (millis() / 1000) % 60;
  static uint8_t lastSecond = 99;

  if (lastSecond != secondHand) {
    lastSecond = secondHand;
    switch (secondHand) {
    case 0:
      currentPalette = RainbowColors_p;
      currentBlending = LINEARBLEND;
      break;
    case 10:
      currentPalette = RainbowStripeColors_p;
      currentBlending = NOBLEND;
      break;
    case 15:
      currentPalette = RainbowStripeColors_p;
      currentBlending = LINEARBLEND;
      break;
    case 20:
      SetupPurpleAndGreenPalette();
      currentBlending = LINEARBLEND;
      break;
    case 25:
      SetupTotallyRandomPalette();
      currentBlending = LINEARBLEND;
      break;
    case 30:
      SetupBlackAndWhiteStripedPalette();
      currentBlending = NOBLEND;
      break;
    case 35:
      SetupBlackAndWhiteStripedPalette();
      currentBlending = LINEARBLEND;
      break;
    case 40:
      currentPalette = CloudColors_p;
      currentBlending = LINEARBLEND;
      break;
    case 45:
      currentPalette = PartyColors_p;
      currentBlending = LINEARBLEND;
      break;
    case 50:
      currentPalette = myRedWhiteBluePalette_p;
      currentBlending = NOBLEND;
      break;
    case 55:
      currentPalette = myRedWhiteBluePalette_p;
      currentBlending = LINEARBLEND;
      break;
    }
  }
}

// This function fills the palette with totally random colors.
void SetupTotallyRandomPalette()
{
  for ( int i = 0; i < 16; ++i) {
    currentPalette[i] = CHSV( random8(), 255, random8());
  }
}

// This function sets up a palette of black and white stripes,
// using code.  Since the palette is effectively an array of
// sixteen CRGB colors, the various fill_* functions can be
// used to set them up.
void SetupBlackAndWhiteStripedPalette()
{
  // 'black out' all 16 palette entries...
  fill_solid( currentPalette, 16, CRGB::Black);
  // and set every fourth one to white.
  currentPalette[0] = CRGB::White;
  currentPalette[4] = CRGB::White;
  currentPalette[8] = CRGB::White;
  currentPalette[12] = CRGB::White;
}

// This function sets up a palette of purple and green stripes.
void SetupPurpleAndGreenPalette()
{
  CRGB purple = CHSV( HUE_PURPLE, 255, 255);
  CRGB green  = CHSV( HUE_GREEN, 255, 255);
  CRGB black  = CRGB::Black;

  currentPalette = CRGBPalette16(
                     green,  green,  black,  black,
                     purple, purple, black,  black,
                     green,  green,  black,  black,
                     purple, purple, black,  black);
}

// This example shows how to set up a static color palette
// which is stored in PROGMEM (flash), which is almost
// always more plentiful than RAM.
const TProgmemPalette16 myRedWhiteBluePalette_p PROGMEM =
{
  CRGB::Red,
  CRGB::Gray, // 'white' is too bright compared to red and blue
  CRGB::Blue,
  CRGB::Black,

  CRGB::Red,
  CRGB::Gray,
  CRGB::Blue,
  CRGB::Black,

  CRGB::Red,
  CRGB::Red,
  CRGB::Gray,
  CRGB::Gray,
  CRGB::Blue,
  CRGB::Blue,
  CRGB::Black,
  CRGB::Black
};
