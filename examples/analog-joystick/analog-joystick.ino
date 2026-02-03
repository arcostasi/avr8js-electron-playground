/*
  Analog Joystick
  Reads the vertical axis (A0), horizontal axis (A1), and the push-button
  (pin 2) of a dual-axis joystick module and prints the values via Serial.

  Wiring:
    VCC  -> 5V
    GND  -> GND
    VERT -> A0   (Y axis)
    HORIZ-> A1   (X axis)
    SEL  -> Pin 2 (push-button, INPUT_PULLUP)
*/

const int PIN_VERT  = A0; // Vertical   (Y-axis) potentiometer
const int PIN_HORIZ = A1; // Horizontal (X-axis) potentiometer
const int PIN_SEL   = 2;  // Push-button (active-LOW with pull-up)

// Center resting value (~512); tolerance band for "neutral" detection
const int CENTER     = 512;
const int DEADZONE   = 50;

// Map raw 0-1023 reading to -100..+100 with a dead-zone
int mapAxis(int raw) {
  int centered = raw - CENTER;
  if (abs(centered) < DEADZONE) return 0;
  return constrain(map(centered, -(CENTER), CENTER, -100, 100), -100, 100);
}

void setup() {
  pinMode(PIN_SEL, INPUT_PULLUP);
  Serial.begin(9600);
  Serial.println("Analog Joystick Demo");
  Serial.println("X   Y   BTN");
}

void loop() {
  int x   = mapAxis(analogRead(PIN_HORIZ));
  int y   = mapAxis(analogRead(PIN_VERT));
  bool btn = (digitalRead(PIN_SEL) == LOW);

  Serial.print(x);   Serial.print("\t");
  Serial.print(y);   Serial.print("\t");
  Serial.println(btn ? "PRESSED" : "open");

  delay(100);
}
