// #include <SPI.h>
// #include <Wire.h>
// #include <Adafruit_GFX.h>
// #include <Adafruit_SSD1306.h>

// SSD1306 settings
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define DELAY_DISPLAY 1000

#define LF       10   // Line Feed
#define CR       13   // Carriage Return

uint8_t curkey = 0;

bool cr = false;

// Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

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

            // Show
            // display.display();

            return;
        }

        // Print on the SSD1306
        // display.write(value);
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

    // Initializes the LCD
    // display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
    // display.display();
    // delay(1000);
}

void loop () {
    // Initializes the 6502 emulator
    exec6502(1000);
    // Get the serial output character
    if (curkey == 0 && Serial.available())
        curkey = Serial.read() & 0x7F;
}
