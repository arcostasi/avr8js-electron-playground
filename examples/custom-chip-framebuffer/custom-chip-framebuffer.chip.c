extern int framebuffer_init(int* pixelWidth, int* pixelHeight);
extern void buffer_write(int handle, int offset, const void* data, int dataLen);
extern int avr8js_millis(void);

#define WIDTH 128
#define HEIGHT 32
#define GLYPH_W 5
#define GLYPH_H 7
#define GLYPH_ADV 6

typedef unsigned char u8;
typedef unsigned int u32;

static const char TEXT[] = "WELCOME TO AVR8JS ELECTRON PLAYGROUND   ";
static u8 frame[WIDTH * HEIGHT * 4];
static int fbHandle = 0;
static int fbW = WIDTH;
static int fbH = HEIGHT;
static int scrollDelayMs = 50;
static int hueDivisor = 12;
static int sparkleCount = 18;

typedef struct {
  u8 r;
  u8 g;
  u8 b;
} Rgb;

static int textLen(void) {
  int n = 0;
  while (TEXT[n] != '\0') n++;
  return n;
}

static int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

static Rgb hsvToRgb(u8 h, u8 s, u8 v) {
  Rgb out;
  if (s == 0) {
    out.r = v;
    out.g = v;
    out.b = v;
    return out;
  }

  u8 region = h / 43;
  u8 remainder = (h - (region * 43)) * 6;

  u8 p = (u8)((v * (255 - s)) >> 8);
  u8 q = (u8)((v * (255 - ((s * remainder) >> 8))) >> 8);
  u8 t = (u8)((v * (255 - ((s * (255 - remainder)) >> 8))) >> 8);

  switch (region) {
    case 0: out.r = v; out.g = t; out.b = p; break;
    case 1: out.r = q; out.g = v; out.b = p; break;
    case 2: out.r = p; out.g = v; out.b = t; break;
    case 3: out.r = p; out.g = q; out.b = v; break;
    case 4: out.r = t; out.g = p; out.b = v; break;
    default: out.r = v; out.g = p; out.b = q; break;
  }

  return out;
}

static void putPixel(int x, int y, u8 r, u8 g, u8 b) {
  if (x < 0 || y < 0 || x >= fbW || y >= fbH) return;
  int idx = (y * fbW + x) * 4;
  frame[idx + 0] = r;
  frame[idx + 1] = g;
  frame[idx + 2] = b;
  frame[idx + 3] = 255;
}

static void fillBackground(int t) {
  int hueShift = clampInt(hueDivisor, 1, 40);
  int sparkles = clampInt(sparkleCount, 0, 40);

  for (int y = 0; y < fbH; y++) {
    for (int x = 0; x < fbW; x++) {
      u8 hue = (u8)((x * 2 + y * 3 + t / hueShift) & 0xFF);
      Rgb c = hsvToRgb(hue, 220, 42);
      putPixel(x, y, c.r, c.g, c.b);
    }
  }

  for (int i = 0; i < sparkles; i++) {
    int sx = (t / 16 + i * 11) % fbW;
    int sy = (t / 27 + i * 7) % fbH;
    putPixel(sx, sy, 200, 200, 200);
  }
}

static u8 glyphRow(char c, int row) {
  switch (c) {
    case 'A': { static const u8 r[7] = {14,17,17,31,17,17,17}; return r[row]; }
    case 'B': { static const u8 r[7] = {30,17,17,30,17,17,30}; return r[row]; }
    case 'C': { static const u8 r[7] = {14,17,16,16,16,17,14}; return r[row]; }
    case 'D': { static const u8 r[7] = {30,17,17,17,17,17,30}; return r[row]; }
    case 'E': { static const u8 r[7] = {31,16,16,30,16,16,31}; return r[row]; }
    case 'F': { static const u8 r[7] = {31,16,16,30,16,16,16}; return r[row]; }
    case 'G': { static const u8 r[7] = {14,17,16,23,17,17,14}; return r[row]; }
    case 'H': { static const u8 r[7] = {17,17,17,31,17,17,17}; return r[row]; }
    case 'I': { static const u8 r[7] = {14,4,4,4,4,4,14}; return r[row]; }
    case 'J': { static const u8 r[7] = {7,2,2,2,2,18,12}; return r[row]; }
    case 'K': { static const u8 r[7] = {17,18,20,24,20,18,17}; return r[row]; }
    case 'L': { static const u8 r[7] = {16,16,16,16,16,16,31}; return r[row]; }
    case 'M': { static const u8 r[7] = {17,27,21,17,17,17,17}; return r[row]; }
    case 'N': { static const u8 r[7] = {17,25,21,19,17,17,17}; return r[row]; }
    case 'O': { static const u8 r[7] = {14,17,17,17,17,17,14}; return r[row]; }
    case 'P': { static const u8 r[7] = {30,17,17,30,16,16,16}; return r[row]; }
    case 'Q': { static const u8 r[7] = {14,17,17,17,21,18,13}; return r[row]; }
    case 'R': { static const u8 r[7] = {30,17,17,30,20,18,17}; return r[row]; }
    case 'S': { static const u8 r[7] = {15,16,16,14,1,1,30}; return r[row]; }
    case 'T': { static const u8 r[7] = {31,4,4,4,4,4,4}; return r[row]; }
    case 'U': { static const u8 r[7] = {17,17,17,17,17,17,14}; return r[row]; }
    case 'V': { static const u8 r[7] = {17,17,17,17,10,10,4}; return r[row]; }
    case 'W': { static const u8 r[7] = {17,17,17,21,21,27,17}; return r[row]; }
    case 'X': { static const u8 r[7] = {17,10,4,4,4,10,17}; return r[row]; }
    case 'Y': { static const u8 r[7] = {17,10,4,4,4,4,4}; return r[row]; }
    case 'Z': { static const u8 r[7] = {31,1,2,4,8,16,31}; return r[row]; }
    case '8': { static const u8 r[7] = {14,17,17,14,17,17,14}; return r[row]; }
    case ' ': return 0;
    default: return 0;
  }
}

static void drawTextAt(int x0, int y0, int t) {
  int len = textLen();
  for (int i = 0; i < len; i++) {
    char ch = TEXT[i];
    int cx = x0 + i * GLYPH_ADV;
    u8 hue = (u8)((t / 8 + i * 9) & 0xFF);
    Rgb col = hsvToRgb(hue, 255, 250);

    for (int row = 0; row < GLYPH_H; row++) {
      u8 bits = glyphRow(ch, row);
      for (int bit = 0; bit < GLYPH_W; bit++) {
        if (bits & (1 << (GLYPH_W - 1 - bit))) {
          putPixel(cx + bit, y0 + row, col.r, col.g, col.b);
        }
      }
    }
  }
}

void chip_init(void) {
  fbHandle = framebuffer_init(&fbW, &fbH);
  if (fbW <= 0) fbW = WIDTH;
  if (fbH <= 0) fbH = HEIGHT;
  scrollDelayMs = 50;
  hueDivisor = 12;
  sparkleCount = 18;
}

void chip_tick(void) {
  int t = avr8js_millis();
  int span = textLen() * GLYPH_ADV;
  int delay = clampInt(scrollDelayMs, 10, 200);
  int scroll = (t / delay) % (span + fbW);
  int x = fbW - scroll;
  int y = (fbH - GLYPH_H) / 2;

  fillBackground(t);
  drawTextAt(x, y, t);

  buffer_write(fbHandle, 0, frame, fbW * fbH * 4);
}

int chip_control_get(int index) {
  if (index == 0) return scrollDelayMs;
  if (index == 1) return hueDivisor;
  if (index == 2) return sparkleCount;
  return 0;
}

void chip_control_set(int index, int value) {
  if (index == 0) scrollDelayMs = clampInt(value, 10, 200);
  if (index == 1) hueDivisor = clampInt(value, 1, 40);
  if (index == 2) sparkleCount = clampInt(value, 0, 40);
}
