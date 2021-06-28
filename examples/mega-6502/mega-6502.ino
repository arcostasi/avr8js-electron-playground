/**
 * This is an example for EhBasic
 * based on the 6502 CPU emulator
 * by Mike Chambers (miker00lz@gmail.com)
 * https://jeelabs.org/book/1549b/
 */

uint8_t curkey = 0;

extern "C" {
    uint16_t getpc();
    uint8_t getop();
    void exec6502(int32_t tickcount);
    int reset6502();

    void serout(uint8_t value) {
        // Print on the serial
        Serial.write(value);
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
    Serial.begin(9600);

    // Prints the number of bytes in
    // the serial output
    Serial.print("[emu6502] ");
    Serial.print(romSize);
    Serial.println(" bytes");
}

void loop () {
    // Initializes the 6502 emulator
    exec6502(1000);

    // Get the serial output character
    if (curkey == 0 && Serial.available())
        curkey = Serial.read() & 0x7F;
}
