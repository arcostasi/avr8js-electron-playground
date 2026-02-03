/*
  DS1307 Real-Time Clock
  Sets the DS1307 RTC to a compile-time date/time on first power-up,
  then reads and prints the current date/time every second.

  Wiring:
    5V  -> 5V
    GND -> GND
    SDA -> A4
    SCL -> A5

  Library: RTClib by Adafruit >= 2.1  (depends on Wire)
*/

#include <Wire.h>
#include <RTClib.h>

RTC_DS1307 rtc;

// Abbreviated day/month names for formatted output
const char* DAYS[]   = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
const char* MONTHS[] = { "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };

void setup() {
  Serial.begin(9600);

  if (!rtc.begin()) {
    Serial.println("Error: DS1307 RTC not found. Check wiring!");
    while (true) { delay(100); }
  }

  // Set time to the moment the sketch was compiled (only when RTC has lost power)
  if (!rtc.isrunning()) {
    Serial.println("RTC stopped! Setting time to compile time...");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  Serial.println("DS1307 RTC Demo");
  Serial.println("---------------------------");
}

void loop() {
  DateTime now = rtc.now();

  // Print formatted date and time
  Serial.print(DAYS[now.dayOfTheWeek()]);  Serial.print(", ");
  Serial.print(MONTHS[now.month()]);       Serial.print(" ");
  if (now.day() < 10) Serial.print("0");
  Serial.print(now.day());                 Serial.print(" ");
  Serial.print(now.year());                Serial.print("  ");
  if (now.hour() < 10) Serial.print("0");
  Serial.print(now.hour());                Serial.print(":");
  if (now.minute() < 10) Serial.print("0");
  Serial.print(now.minute());              Serial.print(":");
  if (now.second() < 10) Serial.print("0");
  Serial.println(now.second());

  delay(1000);
}
