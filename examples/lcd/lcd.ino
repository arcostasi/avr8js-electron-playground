/**
 * LCD-1602 Arduino Simulation
 * Arduino LCD Display Menu System Tutorial,
 * Scrolling Menu, Changeable Variables for Projects.
 * Tutorial: https://www.youtube.com/watch?v=Q58mQFwWv7c
 */

#include <LiquidCrystal_I2C.h>

// The LCD1602 is connected at I²C address 0x27
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Input & Button Logic
const int numOfInputs = 4;
const int inputPins[numOfInputs] = {2, 3, 4, 5};

int inputState[numOfInputs];
int lastInputState[numOfInputs] = {LOW, LOW, LOW, LOW};

bool inputFlags[numOfInputs] = {LOW, LOW, LOW, LOW};

long lastDebounceTime[numOfInputs] = {0, 0, 0, 0};
long debounceDelay = 5;

// LCD Menu Logic
const int numOfScreens = 10;
int currentScreen = 0;

String screens[numOfScreens][2] = {
  {"Motor Voltage",     "Volts"},
  {"Motor Current",     "Amps" },
  {"Motor Rated HP",    "HP"   },
  {"Overload Temp.",    "degC" },
  {"Accel Time",        "Secs" },
  {"Restart Time",      "Mins" },
  {"Analog Out. Curr.", "mA"   },
  {"Input Temp.",       "degC" },
  {"Run Time",          "Hours"},
  {"Start Times",       "times"}
};

int parameters[numOfScreens];

void setup() {
  for (int i = 0; i < numOfInputs; i++) {
    pinMode(inputPins[i], INPUT);
    digitalWrite(inputPins[i], HIGH);
  }

  // LCD begin
  lcd.init();
  lcd.backlight();
  lcd.setCursor(4, 0);

  // Start message
  lcd.print("Welcome!");
  lcd.setCursor(0, 1);
  lcd.print("Press the buttons");
}

void loop() {
  setInputFlags();
  resolveInputFlags();
}

void setInputFlags() {
  for (int i = 0; i < numOfInputs; i++) {
    // Reading pins
    int reading = digitalRead(inputPins[i]);

    // Checks last input state
    if (reading != lastInputState[i]) {
      // Reset debounce time
      lastDebounceTime[i] = millis();
    }

    // Checks debounce time
    if ((millis() - lastDebounceTime[i]) > debounceDelay) {
      if (reading != inputState[i]) {
        // Get input state
        inputState[i] = reading;
        // Checks input state
        if (inputState[i] == HIGH) {
          inputFlags[i] = HIGH;
        }
      }
    }

    // Set last input state
    lastInputState[i] = reading;
  }
}

void resolveInputFlags() {
  // Checks entries
  for (int i = 0; i < numOfInputs; i++) {
    if (inputFlags[i] == HIGH) {
      inputAction(i);
      inputFlags[i] = LOW;
      printScreen();
    }
  }
}

void inputAction(int input) {
  // Checks input action
  switch (input) {
  case 0:
    menuChange(0);
    break;
  case 1:
    menuChange(1);
    break;
  case 2:
    parameterChange(0);
    break;
  case 3:
    parameterChange(1);
    break;
  }
}

void menuChange(int key) {
  switch (key) {
  case 0:
    if (currentScreen == 0) {
      currentScreen = numOfScreens - 1;
    } else {
      currentScreen--;
    }
    break;
  case 1:
    if (currentScreen == numOfScreens - 1) {
      currentScreen = 0;
    } else {
      currentScreen++;
    }
    break;
  }
}

void parameterChange(int key) {
  switch (key) {
  case 0: parameters[currentScreen]++;
    break;
  case 1:
    if (parameters[currentScreen] > 0)
      parameters[currentScreen]--;
    break;
  }
}

void printScreen() {
  lcd.clear();
  lcd.print(screens[currentScreen][0]);
  lcd.setCursor(0, 1);
  lcd.print(parameters[currentScreen]);
  lcd.print(" ");
  lcd.print(screens[currentScreen][1]);
}
