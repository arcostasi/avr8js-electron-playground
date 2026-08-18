/*
  Simon Says Memory Game — 4 Colored LEDs + 4 Pushbuttons + Buzzer + LCD1602 I2C
  - LEDs: Red (D12), Green (D11), Blue (D10), Yellow (D9)
  - Buttons (INPUT_PULLUP): Red (D5), Green (D4), Blue (D3), Yellow (D2)
  - Buzzer: D8
  - LCD1602 I2C (0x27): SDA -> A4, SCL -> A5
*/
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define NUM_COLORS 4
#define MAX_SEQUENCE 32
#define PIN_BUZZ 8

const uint8_t LED_PINS[NUM_COLORS] = { 12, 11, 10, 9 };
const uint8_t BTN_PINS[NUM_COLORS] = { 5, 4, 3, 2 };
const uint16_t TONES[NUM_COLORS]   = { 330, 392, 523, 659 }; // E4, G4, C5, E5
const char* COLOR_NAMES[NUM_COLORS] = { "RED", "GREEN", "BLUE", "YELLOW" };

LiquidCrystal_I2C lcd(0x27, 16, 2);

uint8_t sequence[MAX_SEQUENCE];
uint8_t level = 1;
uint8_t bestScore = 0;

void showStatus(const char* top, const char* bottom) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(top);
  lcd.setCursor(0, 1);
  lcd.print(bottom);
}

void flashColor(uint8_t idx, uint16_t durationMs) {
  digitalWrite(LED_PINS[idx], HIGH);
  tone(PIN_BUZZ, TONES[idx], durationMs);
  delay(durationMs);
  digitalWrite(LED_PINS[idx], LOW);
  noTone(PIN_BUZZ);
}

void playStartJingle() {
  for (uint8_t i = 0; i < NUM_COLORS; i++) {
    flashColor(i, 110);
    delay(45);
  }
}

void playLevelUpJingle() {
  const uint16_t notes[3] = { 523, 659, 784 };
  for (uint8_t i = 0; i < 3; i++) {
    tone(PIN_BUZZ, notes[i], 85);
    delay(95);
  }
  noTone(PIN_BUZZ);
}

void playGameOverJingle() {
  for (uint8_t i = 0; i < NUM_COLORS; i++) {
    digitalWrite(LED_PINS[i], HIGH);
  }
  tone(PIN_BUZZ, 220, 220);
  delay(240);
  tone(PIN_BUZZ, 165, 360);
  delay(380);
  for (uint8_t i = 0; i < NUM_COLORS; i++) {
    digitalWrite(LED_PINS[i], LOW);
  }
  noTone(PIN_BUZZ);
}

int8_t readPressedButton() {
  for (uint8_t i = 0; i < NUM_COLORS; i++) {
    if (digitalRead(BTN_PINS[i]) == LOW) {
      delay(20); // debounce
      if (digitalRead(BTN_PINS[i]) == LOW) {
        return (int8_t)i;
      }
    }
  }
  return -1;
}

void waitForButtonRelease(uint8_t idx) {
  while (digitalRead(BTN_PINS[idx]) == LOW) {
    delay(10);
  }
  delay(30);
}

void seedSequence() {
  randomSeed(analogRead(A0) ^ millis());
  for (uint8_t i = 0; i < MAX_SEQUENCE; i++) {
    sequence[i] = (uint8_t)random(NUM_COLORS);
  }
}

void playSequence() {
  char top[17];
  char bot[17];
  snprintf(top, sizeof(top), "SIMON  LEVEL:%2u", level);
  snprintf(bot, sizeof(bot), "WATCH! BEST:%2u", bestScore);
  showStatus(top, bot);
  delay(450);

  uint16_t stepMs = (level > 10) ? 260 : (uint16_t)(420 - level * 15);
  for (uint8_t i = 0; i < level; i++) {
    flashColor(sequence[i], stepMs);
    delay(140);
  }
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < NUM_COLORS; i++) {
    pinMode(LED_PINS[i], OUTPUT);
    pinMode(BTN_PINS[i], INPUT_PULLUP);
  }
  pinMode(PIN_BUZZ, OUTPUT);

  lcd.init();
  lcd.backlight();
  showStatus("SIMON SAYS 4x", "Get ready!");
  Serial.println(F("Simon Says Memory Game ready!"));

  seedSequence();
  playStartJingle();
  delay(400);
}

void loop() {
  playSequence();

  char top[17];
  char bot[17];
  snprintf(top, sizeof(top), "YOUR TURN LV:%2u", level);
  snprintf(bot, sizeof(bot), "SCORE:%2u BEST:%2u", (uint8_t)(level - 1), bestScore);
  showStatus(top, bot);

  for (uint8_t step = 0; step < level; step++) {
    int8_t pressed = -1;
    while (pressed < 0) {
      pressed = readPressedButton();
      delay(10);
    }

    uint8_t choice = (uint8_t)pressed;
    flashColor(choice, 180);
    waitForButtonRelease(choice);

    if (choice != sequence[step]) {
      uint8_t score = (uint8_t)(level - 1);
      if (score > bestScore) bestScore = score;
      snprintf(top, sizeof(top), "GAME OVER! SCR:%u", score);
      snprintf(bot, sizeof(bot), "BEST:%2u RESTART", bestScore);
      showStatus(top, bot);
      Serial.print(F("Wrong button ("));
      Serial.print(COLOR_NAMES[choice]);
      Serial.print(F(" != "));
      Serial.print(COLOR_NAMES[sequence[step]]);
      Serial.print(F("). Score: "));
      Serial.println(score);

      playGameOverJingle();
      delay(1400);
      level = 1;
      seedSequence();
      playStartJingle();
      return;
    }
  }

  if (level > bestScore) {
    bestScore = level;
  }

  Serial.print(F("Level "));
  Serial.print(level);
  Serial.println(F(" cleared!"));
  playLevelUpJingle();

  if (level >= MAX_SEQUENCE) {
    showStatus("YOU WIN!! MAX LV", "Restarting...");
    delay(1800);
    level = 1;
    seedSequence();
  } else {
    level++;
  }
  delay(350);
}
