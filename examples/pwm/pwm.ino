/**
 * Blue LED connected to pin 11 => Enjoy!
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
void setup() {
  Serial.begin(115200);
  pinMode(11, OUTPUT);
}

byte brightness = 0;
void loop() {
  analogWrite(11, brightness);
  delay(20);
  brightness++;
}
