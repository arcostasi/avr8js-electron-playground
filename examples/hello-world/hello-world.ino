/*
  Hello World
  by Anderson Costa with ❤ for the Wokwi community
  Visit https://wokwi.com to learn about the Wokwi
*/
#include <LiquidCrystal_I2C.h>

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
  lcd.print("Hello World!");
  lcd.blink();
}

int i = 0;
char *msg = "I \x03 Wokwi \xaf";

void loop() {
  if (i < strlen(msg)) {
    lcd.setCursor(i + 2, 1);
    lcd.print(msg[i]);
    i++;
  }
  delay(200);
}
