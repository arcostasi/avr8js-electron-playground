typedef unsigned int u32;

extern int spi_init(const void* config);
extern void spi_start(int devId, void* buffer, int count);
extern int avr8js_millis(void);

typedef struct {
  u32 sckPin;
  u32 mosiPin;
  u32 misoPin;
  u32 ssPin;
  u32 done;
  u32 userData;
} SpiConfig;

static int spiDev = 0;
static unsigned char xfer[1] = { 0x10 };
static int armed = 0;
static int seedByte = 0x10;
static int stepByte = 1;
static int transferIntervalMs = 300;
static int lastTransferMs = -100000;

static int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

void spi_done(u32 userData, u32 bufferPtr, u32 transferred) {
  (void)userData;
  (void)bufferPtr;
  (void)transferred;
  xfer[0] = (unsigned char)(xfer[0] + stepByte);
  armed = 0;
}

void chip_init(void) {
  SpiConfig cfg;
  cfg.sckPin = 0;
  cfg.mosiPin = 1;
  cfg.misoPin = 2;
  cfg.ssPin = 3;
  cfg.done = (u32)(unsigned long)&spi_done;
  cfg.userData = 0;
  spiDev = spi_init(&cfg);
  xfer[0] = (unsigned char)seedByte;
  lastTransferMs = avr8js_millis();
}

void chip_tick(void) {
  int now = avr8js_millis();
  if (!armed && now - lastTransferMs >= transferIntervalMs) {
    spi_start(spiDev, xfer, 1);
    armed = 1;
    lastTransferMs = now;
  }
}

int chip_control_get(int index) {
  if (index == 0) return seedByte;
  if (index == 1) return stepByte;
  if (index == 2) return transferIntervalMs;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) {
    seedByte = clampInt(value, 0, 255);
    xfer[0] = (unsigned char)seedByte;
  }
  if (index == 1) stepByte = clampInt(value, 0, 32);
  if (index == 2) transferIntervalMs = clampInt(value, 20, 2000);
}
