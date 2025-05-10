extern int attr_init(const char* name, int defaultValue);
extern int attr_read(int handle);
extern void pin_mode(int pin, int mode);
extern void pin_write(int pin, int value);
extern int millis(void);

#define OUTPUT 3

static int hBlinkMs = 0;
static int hDuty = 0;
static int blinkMs = 500;
static int dutyPercent = 50;

static int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

void chip_init(void) {
  hBlinkMs = attr_init("blinkMs", 500);
  hDuty = attr_init("dutyPercent", 50);
  blinkMs = attr_read(hBlinkMs);
  dutyPercent = attr_read(hDuty);
  pin_mode(0, OUTPUT);
}

void chip_tick(void) {
  int period = blinkMs;
  int duty = dutyPercent;

  if (period < 50) period = 50;
  if (duty < 5) duty = 5;
  if (duty > 95) duty = 95;

  int now = millis();
  int phase = now % period;
  int on = phase < ((period * duty) / 100);

  pin_write(0, on ? 1 : 0);
}

int chip_control_get(int index) {
  if (index == 0) return blinkMs;
  if (index == 1) return dutyPercent;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) blinkMs = clampInt(value, 50, 2000);
  if (index == 1) dutyPercent = clampInt(value, 5, 95);
}
