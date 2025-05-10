typedef unsigned int u32;

extern int uart_init(const void* config);
extern int uart_write(int uartId, const void* buffer, int count);
extern int avr8js_millis(void);

typedef struct {
  u32 rxPin;
  u32 txPin;
  u32 baud;
  u32 rxData;
  u32 writeDone;
  u32 userData;
} UartConfig;

static int uartId = 0;
static int busy = 0;
static int lastSend = 0;
static int sendIntervalMs = 1000;
static int tagDigit = 0;
static char msg[] = "[custom-chip-uart#0] Hello from custom chip UART!\\n";

#define TAG_INDEX 18

static int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

static void refreshTag(void) {
  msg[TAG_INDEX] = (char)('0' + clampInt(tagDigit, 0, 9));
}

void on_uart_done(u32 userData) {
  (void)userData;
  busy = 0;
}

void chip_init(void) {
  UartConfig cfg;
  cfg.rxPin = 0;   // RX
  cfg.txPin = 1;   // TX
  cfg.baud = 115200;
  cfg.rxData = 0;
  cfg.writeDone = (u32)(unsigned long)&on_uart_done;
  cfg.userData = 0;
  uartId = uart_init(&cfg);
  refreshTag();
  lastSend = avr8js_millis();
}

void chip_tick(void) {
  int now = avr8js_millis();
  if (!busy && now - lastSend >= sendIntervalMs) {
    busy = 1;
    lastSend = now;
    uart_write(uartId, msg, (int)(sizeof(msg) - 1));
  }
}

int chip_control_get(int index) {
  if (index == 0) return sendIntervalMs;
  if (index == 1) return tagDigit;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) sendIntervalMs = clampInt(value, 100, 5000);
  if (index == 1) {
    tagDigit = clampInt(value, 0, 9);
    refreshTag();
  }
}
