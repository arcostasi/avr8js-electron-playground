extern void pin_mode(int pin, int mode);
extern void pin_write(int pin, int value);
extern int millis(void);
extern int micros(void);

#define OUTPUT 3

static int lastFlip = 0;
static int state = 0;
static int intervalMs = 500;
static int startHigh = 0;

static int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

void chip_init(void) {
  pin_mode(0, OUTPUT);
  state = startHigh ? 1 : 0;
  pin_write(0, state);
  lastFlip = millis();
}

void chip_tick(void) {
  int now = millis();
  (void)micros(); // Exercise time API call path

  if (now - lastFlip >= intervalMs) {
    state = state ? 0 : 1;
    pin_write(0, state);
    lastFlip = now;
  }
}

int chip_control_get(int index) {
  if (index == 0) return intervalMs;
  if (index == 1) return startHigh;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) intervalMs = clampInt(value, 50, 2000);
  if (index == 1) {
    startHigh = value ? 1 : 0;
    state = startHigh;
    pin_write(0, state);
  }
}
