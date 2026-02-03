/*
  MicroSD Card Data Logger
  Initializes a microSD card via SPI and writes a new log line every second.
  The log file (LOG.TXT) is created if it does not exist; lines are appended.

  Wiring (SPI):
    MOSI -> Pin 11
    MISO -> Pin 12
    SCK  -> Pin 13
    CS   -> Pin 10
    VCC  -> 5V
    GND  -> GND

  Library: SD (built-in with Arduino IDE)
*/

#include <SPI.h>
#include <SD.h>

const int SD_CS_PIN = 10; // Chip select for SD card
const char* LOG_FILE = "LOG.TXT";

unsigned long counter = 0; // Line counter used as a simple "timestamp"

void setup() {
  Serial.begin(9600);
  Serial.println("MicroSD Card Demo");

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("Error: SD card initialization failed. Check wiring/card!");
    while (true) { delay(100); }
  }

  Serial.println("SD card initialized.");

  // Print existing log content to Serial Monitor
  if (SD.exists(LOG_FILE)) {
    File f = SD.open(LOG_FILE);
    if (f) {
      Serial.println("--- Existing log ---");
      while (f.available()) {
        Serial.write(f.read());
      }
      f.close();
      Serial.println("--- End of log ---");
    }
  }
}

void loop() {
  File logFile = SD.open(LOG_FILE, FILE_WRITE);

  if (logFile) {
    char line[48];
    snprintf(line, sizeof(line), "Entry %05lu | millis=%lu", counter, millis());
    logFile.println(line);
    logFile.close();

    Serial.println(line);
    counter++;
  } else {
    Serial.println("Error: Could not open log file for writing.");
  }

  delay(1000);
}
