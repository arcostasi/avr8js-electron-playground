// Rocky Theme melody

#define BUTTON 4
#define BUZZER 6
#define PAUSE 20

unsigned int notes[4] = {262, 294, 330, 349};

void setup() {
  // initialize digital pin LED_BUILTIN as an output.
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);
}

void notada(int f, int t) {
  tone(BUZZER, f);
  digitalWrite(LED_BUILTIN, HIGH);
  delay(t - PAUSE);
  noTone(BUZZER);
  digitalWrite(LED_BUILTIN, LOW);
  delay(PAUSE);
}

void marcha(int f1, int f2) {
  notada(f1, 300);
  notada(f2, 150);
  notada(f2, 150);
}

void desmarcha(int f1) {
  notada(f1, 150);
  notada(f1, 150);
}

void sequencia() {
  marcha(262, 262);
  marcha(262, 262);
  marcha(330, 262);
  notada(262, 600);
  marcha(330, 330);
  marcha(330, 330);
  marcha(394, 330);
  notada(330, 600);
  marcha(330, 330);
  marcha(330, 330);
  desmarcha(330);
  notada(330, 900);
  marcha(330, 330);
  marcha(330, 330);
  desmarcha(330);
  notada(330, 300);

  for (int i = 0; i < 2; i++) {
    notada(330, 150);
    notada(394, 450);
    notada(440, 1800);
    notada(440, 150);
    notada(494, 450);
    notada(330, 1800);
    notada(330, 150);
    notada(394, 450);
    notada(440, 1800);
    notada(440, 150);
    notada(494, 450);
    notada(330, 1800);

    noTone(BUZZER);
    delay(300);

    notada(294, 150);
    notada(262, 150);
    notada(294, 450);
    notada(262, 150);
    notada(294, 150);
    notada(330, 1050);

    noTone(BUZZER);
    delay(300);

    notada(523, 150);
    notada(523, 150);
    notada(494, 300);
    notada(494, 150);
    notada(440, 300);
    notada(440, 150);
    notada(392, 600);
    notada(349, 300);
    notada(330, 1400);
    notada(330, 150);
    notada(349, 450);
    notada(330, 2400);
  }
}

void loop() {
  if (digitalRead(BUTTON) == LOW) {
    sequencia();
  }
}
