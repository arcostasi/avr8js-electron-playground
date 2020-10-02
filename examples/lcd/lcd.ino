/**
 * LCD-1602 Arduino Simulation
 * Part of Wokwi Playground
 * https://wokwi.com/playground/lcd1602-i2c
 * Copyright (C) 2020, Uri Shaked
 */

#include <LiquidCrystal_I2C.h>

// The LCD1602 is connected at I²C address 0x27
LiquidCrystal_I2C lcd(0x27, 16, 2);

byte heart[8] = {
  0b00000,
  0b01010,
  0b11111,
  0b11111,
  0b11111,
  0b01110,
  0b00100,
  0b00000,
};

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.createChar(3, heart);
  lcd.setCursor(2, 0);
  lcd.print("I \x03 Arduino \xaf");
  lcd.blink();
}

int i = 0;
char *msg = "Hello, Wokwi!";

void loop() {
  if (i < strlen(msg)) {
    lcd.setCursor(i + 2, 1);
    lcd.print(msg[i]);
    i++;
  }

  delay(200);
}
