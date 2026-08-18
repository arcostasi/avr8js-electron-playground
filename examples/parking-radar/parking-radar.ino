/*
  Ultrasonic Parking Radar — HC-SR04 + 16-LED Ring + Servo + Buzzer + LCD1602
  - HC-SR04: TRIG -> D9, ECHO -> D8
  - 16-LED Ring (NeoPixel): DIN -> D6
  - Servo indicator/barrier: PWM -> D10
  - Buzzer: D7
  - LCD1602 I2C (0x27): SDA -> A4, SCL -> A5
  - Outputs Plotter-ready labeled telemetry: Distance | Angle | Zone
*/
#define FASTLED_INTERNAL
#include <FastLED.h>
#include <Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define PIN_TRIG 9
#define PIN_ECHO 8
#define PIN_RING 6
#define PIN_SERVO 10
#define PIN_BUZZ 7
#define NUM_RING_LEDS 16

CRGB ringLeds[NUM_RING_LEDS];
Servo gateServo;
LiquidCrystal_I2C lcd(0x27, 16, 2);

uint32_t lastBeepMs = 0;
uint32_t lastSampleMs = 0;

uint16_t readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  uint32_t durationUs = pulseIn(PIN_ECHO, HIGH, 28000UL);
  if (durationUs == 0) {
    return 250;
  }
  return (uint16_t)((durationUs * 343UL) / 20000UL);
}

void updateRingGauge(uint16_t distCm) {
  uint16_t clamped = constrain(distCm, 5, 160);
  uint8_t activeLeds = (uint8_t)map(clamped, 160, 5, 1, NUM_RING_LEDS);

  for (uint8_t i = 0; i < NUM_RING_LEDS; i++) {
    if (i < activeLeds) {
      if (i < 6) {
        ringLeds[i] = CRGB(0, 220, 70);     // Green safe band
      } else if (i < 11) {
        ringLeds[i] = CRGB(245, 190, 0);    // Amber caution band
      } else {
        ringLeds[i] = CRGB(255, 25, 25);    // Red danger band
      }
    } else {
      ringLeds[i] = CRGB::Black;
    }
  }
  FastLED.show();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZ, OUTPUT);

  FastLED.addLeds<NEOPIXEL, PIN_RING>(ringLeds, NUM_RING_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(200);

  gateServo.attach(PIN_SERVO);
  gateServo.write(90);

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("PARKING RADAR");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  Serial.println(F("Ultrasonic Parking Radar ready."));
  delay(400);
}

void loop() {
  uint32_t now = millis();
  if (now - lastSampleMs < 150UL) {
    return;
  }
  lastSampleMs = now;

  uint16_t distCm = readDistanceCm();
  uint8_t zone = 0;
  const char* zoneLabel = "SAFE   ";
  uint16_t beepIntervalMs = 0;

  if (distCm <= 25) {
    zone = 2;
    zoneLabel = "STOP!! ";
    beepIntervalMs = 160;
  } else if (distCm <= 75) {
    zone = 1;
    zoneLabel = "CAUTION";
    beepIntervalMs = (uint16_t)map((long)distCm, 25, 75, 220, 650);
  }

  int angle = (int)map((long)constrain(distCm, 10, 150), 10, 150, 15, 165);
  gateServo.write(angle);
  updateRingGauge(distCm);

  if (beepIntervalMs > 0 && (now - lastBeepMs >= beepIntervalMs)) {
    lastBeepMs = now;
    tone(PIN_BUZZ, zone == 2 ? 1760 : 1047, 70);
  } else if (beepIntervalMs == 0) {
    noTone(PIN_BUZZ);
  }

  char line0[17];
  char line1[17];
  snprintf(line0, sizeof(line0), "DIST:%3ucm %s", distCm, zoneLabel);
  snprintf(line1, sizeof(line1), "BARRIER:%3d deg ", angle);
  lcd.setCursor(0, 0);
  lcd.print(line0);
  lcd.setCursor(0, 1);
  lcd.print(line1);

  Serial.print(F("Distance: "));
  Serial.print(distCm);
  Serial.print(F(" cm | Angle: "));
  Serial.print(angle);
  Serial.print(F(" | Zone: "));
  Serial.println(zone);
}
