extern void pin_mode(int pin, int mode);
extern void pin_write(int pin, int value);
extern void pin_dac_write(int pin, float voltage);
extern int avr8js_millis(void);

#define OUTPUT 3

static int periodMs = 400;
static int maxVoltageMv = 5000;
static int thresholdPercent = 50;

static int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

void chip_init(void) {
  pin_mode(0, OUTPUT); // AOUT
  pin_mode(1, OUTPUT); // DOUT
}

void chip_tick(void) {
  int t = avr8js_millis();
  int period = clampInt(periodMs, 100, 4000);
  int half = period / 2;
  int phase = t % period;
  int triMs = phase < half ? phase : (period - phase);
  int clampedMaxMv = clampInt(maxVoltageMv, 500, 5000);
  int voltageMv = (triMs * clampedMaxMv) / (half > 0 ? half : 1);
  int thresholdMv = (clampedMaxMv * clampInt(thresholdPercent, 5, 95)) / 100;
  float volts = voltageMv / 1000.0f;

  pin_dac_write(0, volts);
  pin_write(1, voltageMv >= thresholdMv ? 1 : 0);
}

int chip_control_get(int index) {
  if (index == 0) return periodMs;
  if (index == 1) return maxVoltageMv;
  if (index == 2) return thresholdPercent;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) periodMs = clampInt(value, 100, 4000);
  if (index == 1) maxVoltageMv = clampInt(value, 500, 5000);
  if (index == 2) thresholdPercent = clampInt(value, 5, 95);
}
