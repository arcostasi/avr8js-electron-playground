// Minimal custom chip for AVR8js Electron MVP runtime
// Pins (from diagram):
//   pinIndex 0 -> IN
//   pinIndex 1 -> OUT

extern int avr8js_gpio_read(int pinIndex);
extern void avr8js_gpio_write(int pinIndex, int value);
extern int avr8js_millis(void);

static int outputState = 0;
static int lastEdgeMs = -100000;
static int debounceMs = 200;

void chip_init(void) {
  outputState = 0;
  avr8js_gpio_write(1, outputState);
}

void chip_tick(void) {
  int input = avr8js_gpio_read(0);
  int now = avr8js_millis();

  // Rising edge toggles output with debounce
  static int prev = 0;
  if (input && !prev && (now - lastEdgeMs) >= debounceMs) {
    outputState = outputState ? 0 : 1;
    avr8js_gpio_write(1, outputState);
    lastEdgeMs = now;
  }
  prev = input;
}

int chip_control_get(int index) {
  if (index == 0) return debounceMs;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) {
    if (value < 10) value = 10;
    if (value > 1000) value = 1000;
    debounceMs = value;
  }
}
