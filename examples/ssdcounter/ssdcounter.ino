/**
 * https://avr8js-ssd1306.stackblitz.io/
 */

#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// SSD1306
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define DELAY_DISPLAY 1000

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

unsigned long timerDisplay = 0;

int counter = 0;

// The setup function runs once when you press reset or power the board
void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  display.display();
  delay(1000);
}

// The loop function runs over and over again forever
void loop() {
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
