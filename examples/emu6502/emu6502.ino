#include <LiquidCrystal_I2C.h>

#define LCD_ADDR 0x27 // LCD address
#define LCD_COLS 16   // Number of columns on the LCD
#define LCD_ROWS 2    // Number of lines on the LCD
#define LF       10   // Line Feed
#define CR       13   // Carriage Return

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

uint8_t curkey = 0;
uint8_t row = 0;
uint8_t col = 0;

bool cr = false;
bool clear = false;

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

            if (col > 0) {
                row++;
            }

            col = 0;
            return;
        }

        // Checks the limit rows
        if (row >= LCD_ROWS) {
            clear = true;
        }

        // Check the LCD cleanliness
        if (clear) {
            // LCD Clear
            clear = false;
            lcd.clear();

            // Reset positions
            row = 0;
            col = 0;
        }

        // Print on the LCD
        lcd.setCursor(col, row);
        lcd.write(value);

        // Checks the limit cols
        if (col < LCD_COLS) {
            col++;
        } else {
            col=0;
            row++;
        }
    }

    uint8_t getkey() {
        uint8_t key = curkey;
        curkey = 0;
        return key;
    }
}

void setup () {
    // Reset the 6502 emulator
    uint32_t romSize = reset6502();

    // Initializes the serial port
    Serial.begin(115200);

    // Prints the number of bytes in the serial output
    Serial.print("[emu6502] ");
    Serial.print(romSize);
    Serial.println(" bytes");

    // Initializes the LCD
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("[emu6502]");
}

void loop () {
    // Initializes the 6502 emulator
    exec6502(1000);
    // Get the serial output character
    if (curkey == 0 && Serial.available())
        curkey = Serial.read() & 0x7F;
}
