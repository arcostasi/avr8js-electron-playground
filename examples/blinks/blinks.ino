#define DELAY_LED 250

// LEDs connected to pins 8..13
byte ledPins[] = {13, 12, 11, 10, 9, 8};
byte i = 0;

unsigned long timerLed = 0;

bool switchLed = true;

// The setup function runs once when you press reset or power the board
void setup() {
  Serial.begin(115200);
  // Initialize digital pins LED as an output.
  for (byte n = 0; n < sizeof(ledPins); n++) {
    pinMode(ledPins[n], OUTPUT);
  }
}

// The loop function runs over and over again forever
void loop() {
  if ((millis() - timerLed) > DELAY_LED) {
    timerLed = millis();

    Serial.print("LED: ");
    Serial.println(ledPins[i]);

    digitalWrite(ledPins[i], switchLed);

    if ((i + 1) == sizeof(ledPins)) {
      switchLed = !switchLed;
    }

    i = (i + 1) % sizeof(ledPins);
  }
}
