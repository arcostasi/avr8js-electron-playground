const ARDUINO_CODE =
`#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "FastLED.h"
// #include "pitches.h"

// SSD1306
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// Matrix size
#define NUM_ROWS 9
#define NUM_COLS 9

// LEDs pin
#define DATA_PIN 3

// LED brightness
#define BRIGHTNESS 180

#define NUM_LEDS NUM_ROWS * NUM_COLS

#define DELAY_LED 250
#define DELAY_DISPLAY 1000

// Define the array of leds
CRGB rgbLeds[NUM_LEDS];

unsigned int timerLed = 0;
unsigned int timerDisplay = 0;

bool switchLed = true;

// LEDs connected to pins 8..13
byte ledPins[] = {13, 12, 11, 10, 9, 8};
byte i = 0;

byte buttonPins[] = {2, 3, 4, 5};

int counter = 0;
int animate = 0;

byte servoPin = 6;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void initServo()
{
  pinMode(servoPin, OUTPUT);
}

void initButtons()
{
  for (byte i = 0; i < sizeof(buttonPins); i++) {
    pinMode(buttonPins[i], INPUT);
  }
}

void initLEDs()
{
  for (byte i = 0; i < sizeof(ledPins); i++) {
    pinMode(ledPins[i], OUTPUT);
  }
}

void initFastLED()
{
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(rgbLeds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void initSSD130()
{
  display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  display.display();
  delay(1000);
}

void setup() {
  Serial.begin(115200);
  SPI.begin();

  initServo();
  initButtons();
  initLEDs();
  initFastLED();
  initSSD130();
}

void blinkLeds()
{
  if ((millis() - timerLed) > DELAY_LED) {
    timerLed = millis();

    Serial.print("LED: ");
    Serial.println(ledPins[i]);

    SPI.transfer(i);

    digitalWrite(ledPins[i], switchLed);

    if ((i + 1) == sizeof(ledPins)) {
      switchLed = !switchLed;
    }

    i = (i + 1) % sizeof(ledPins);
  }
}

void NeoPixels()
{
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

void ssdDisplay()
{
  if ((millis() - timerDisplay) > DELAY_DISPLAY) {
    timerDisplay = millis();
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(4, 4);
    display.println(F("Hello, Wokwi!"));
    display.setTextSize(2);
    display.setCursor(54, 24);
    display.println(counter);
    display.display();
    counter++;
  }
}

void servoRotate()
{
  digitalWrite(servoPin, switchLed);
}

void loop() {
  blinkLeds();
  NeoPixels();
  ssdDisplay();
  servoRotate();
}
`;

let editor;

require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
    value: ARDUINO_CODE,
    language: 'cpp',
    theme: "vs-dark",
    minimap: {
      enabled: false
    }
  });
});

function getEditor() {
  return editor;
}
