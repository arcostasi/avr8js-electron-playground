#include <SPI.h>

#define DELAY_ROTATE 1000

bool switchRotate = true;
byte servoPin = 6;

unsigned int timerRotate = 0;

// The setup function runs once when you press reset or power the board
void setup() {
  SPI.begin();
  pinMode(servoPin, OUTPUT);
}

// The loop function runs over and over again forever
void loop() {

  if ((millis() - timerRotate) > DELAY_ROTATE) {
    timerRotate = millis();

    switchRotate = !switchRotate;
  }

  digitalWrite(servoPin, switchRotate);
}
