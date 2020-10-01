uint8_t curkey = 0;

extern "C" {
    uint16_t getpc();
    uint8_t getop();
    void exec6502(int32_t tickcount);
    int reset6502();

    void serout(uint8_t val) {
        Serial.write(val);
    }

    uint8_t getkey() {
        uint8_t key = curkey;
        curkey = 0;
        return key;
    }
}

void setup () {
    Serial.begin(115200);
    Serial.print("[emu6502] ");
    Serial.print(reset6502());
    Serial.println(" bytes");
}

void loop () {
    exec6502(1000);
    if (curkey == 0 && Serial.available())
        curkey = Serial.read() & 0x7F;
}
