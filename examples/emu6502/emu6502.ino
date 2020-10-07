/**
 * This is an example for EhBasic based on SSD1306
 * https://jeelabs.org/book/1549b/
 */

#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// SSD1306 settings
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define DELAY_DISPLAY 1000
#define CLEAR_DISPLAY 5000

// Declaration for an SSD1306 display connected to I2C (SDA, SCL pins)
#define OLED_RESET    4  // Reset pin # (or -1 if sharing Arduino reset pin)

#define LF            10 // Line Feed
#define CR            13 // Carriage Return

uint8_t curkey = 0;

bool cr = false;
bool showDisplay = false;
bool clearDisplay = false;

char serialBuffer[128]; // Must be large enough for the whole string

// Command ready
char ready[5] = "Ready";

uint8_t increment = 0;
uint8_t position = 0;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

extern "C" {
    uint16_t getpc();
    uint8_t getop();
    void exec6502(int32_t tickcount);
    int reset6502();

    void serout(uint8_t value) {
        // Print on the serial
        Serial.write(value);

        // Checks Carriage Return
        if (value == CR) {
            cr = true;
            return;
        }

        // Checks Line Feed
        if (cr && value == LF) {
            cr = false;
        }

        // Print on the SSD1306
        serialBuffer[increment++] = value;

        // Set position
        position = (value == ready[position]) ? position + 1 : 0;

        // Checks ready
        if ((position == 5) || (increment > 127)) {
            // Reset position
            position = 0;

            // Reset increment
            increment = 0;

            // Print serial buffer
            showDisplay = true;
        }
    }

    uint8_t getkey() {
        uint8_t key = curkey;
        curkey = 0;
        return key;
    }
}

void setup () {
    // Increase RAM size
    SP = 0x7fff;

    // Reset the 6502 emulator
    uint32_t romSize = reset6502();

    // Initializes the serial port
    Serial.begin(115200);

    // Prints the number of bytes in the serial output
    Serial.print("[emu6502] ");
    Serial.print(romSize);
    Serial.println(" bytes");

    // SSD1306_SWITCHCAPVCC = generate display voltage from 3.3V internally
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) { // Address 0x3D for 128x64
        Serial.println(F("SSD1306 allocation failed"));
        for (;;); // Don't proceed, loop forever
    }

    // Clear the buffer
    display.clearDisplay();

    // Show initial display buffer contents on the screen
    display.display();
    delay(1000);

    display.setCursor(1, 1);
}

void loop () {
    // Initializes the 6502 emulator
    exec6502(1000);

    // Get the serial output character
    if (curkey == 0 && Serial.available())
        curkey = Serial.read() & 0x7F;

    if (showDisplay) {
        // Disable flag
        showDisplay = false;

        // Print serial buffer
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(1, 1);
        display.println(serialBuffer);
        display.display();

        // Clear serial buffer
        clearDisplay = true;
    }

    if (clearDisplay) {
        // Disable flag
        clearDisplay = false;

        // Clear the buffer
        for (uint8_t i = 0; i < sizeof(serialBuffer); i++) {
            serialBuffer[i] = (char)0;
        }
    }
}
