static unsigned char nextValue = 0;
static unsigned char startValue = 0;
static unsigned char stepValue = 1;

void chip_init(void) {
  nextValue = startValue;
}

void chip_tick(void) {
  // Keep state local; values are exchanged via chip_i2c_* callbacks.
}

int chip_i2c_connect(int addr, int write) {
  (void)addr;
  (void)write;
  return 1;
}

int chip_i2c_read(int acked) {
  (void)acked;
  unsigned char out = nextValue;
  nextValue = (unsigned char)(nextValue + stepValue);
  return out;
}

int chip_i2c_write(int value) {
  nextValue = (unsigned char)(value & 0xFF);
  return 1;
}

void chip_i2c_disconnect(void) {
}

int chip_control_get(int index) {
  if (index == 0) return startValue;
  if (index == 1) return stepValue;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) {
    startValue = (unsigned char)(value & 0xFF);
    nextValue = startValue;
  }
  if (index == 1) {
    if (value < 0) value = 0;
    if (value > 32) value = 32;
    stepValue = (unsigned char)value;
  }
}
