/*
  8x8x8 3D RGB LED Cube — Geometry & Waveforms (FastLED + Wokwi Custom View)
  Custom View URL: http://localhost:3000/?size=8
  Compatible with FastLED 3.x+ on Arduino Mega 2560 (Data pin 3, 512 NeoPixels)

  Serial Monitor Controls (115200 baud):
    n / p : Next / Previous effect
    0 - 5 : Jump directly to an effect
    a     : Toggle auto-cycle
    + / - : Adjust brightness
    ?     : Print command help & effect list
*/
#define FASTLED_INTERNAL
#include <FastLED.h>

#define CUBE_SIZE 8
#define NUM_LEDS (CUBE_SIZE * CUBE_SIZE * CUBE_SIZE)
#define DATA_PIN 3
#define NUM_EFFECTS 6

CRGB leds[NUM_LEDS];

static inline uint16_t XYZ(uint8_t x, uint8_t y, uint8_t z) {
  return (uint16_t)z * (CUBE_SIZE * CUBE_SIZE) + (uint16_t)y * CUBE_SIZE + x;
}

static inline int16_t s8(uint8_t a) {
  return (int16_t)sin8(a) - 128;
}

static inline int16_t c8(uint8_t a) {
  return (int16_t)cos8(a) - 128;
}

static inline void setVoxel(int8_t x, int8_t y, int8_t z, const CRGB& c) {
  if (x >= 0 && x < CUBE_SIZE && y >= 0 && y < CUBE_SIZE && z >= 0 && z < CUBE_SIZE) {
    leds[XYZ((uint8_t)x, (uint8_t)y, (uint8_t)z)] = c;
  }
}

static inline void addVoxel(int8_t x, int8_t y, int8_t z, const CRGB& c) {
  if (x >= 0 && x < CUBE_SIZE && y >= 0 && y < CUBE_SIZE && z >= 0 && z < CUBE_SIZE) {
    leds[XYZ((uint8_t)x, (uint8_t)y, (uint8_t)z)] += c;
  }
}

static void addSubVoxelQ8(int16_t x8, int16_t y8, int16_t z8, const CRGB& c) {
  int8_t ix = (int8_t)(x8 >> 8);
  int8_t iy = (int8_t)(y8 >> 8);
  int8_t iz = (int8_t)(z8 >> 8);
  uint8_t fx = (uint8_t)(x8 & 0xFF);
  uint8_t fy = (uint8_t)(y8 & 0xFF);
  uint8_t fz = (uint8_t)(z8 & 0xFF);

  uint8_t wx[2] = { (uint8_t)(255 - fx), fx };
  uint8_t wy[2] = { (uint8_t)(255 - fy), fy };
  uint8_t wz[2] = { (uint8_t)(255 - fz), fz };

  for (uint8_t dz = 0; dz < 2; dz++) {
    for (uint8_t dy = 0; dy < 2; dy++) {
      uint8_t wzy = scale8(wz[dz], wy[dy]);
      if (wzy < 6) continue;
      for (uint8_t dx = 0; dx < 2; dx++) {
        uint8_t w = scale8(wzy, wx[dx]);
        if (w < 6) continue;
        CRGB sc = c;
        sc.nscale8_video(w);
        addVoxel(ix + (int8_t)dx, iy + (int8_t)dy, iz + (int8_t)dz, sc);
      }
    }
  }
}

// 3D integer Bresenham line renderer
static void drawLine3D(
    int8_t x0, int8_t y0, int8_t z0,
    int8_t x1, int8_t y1, int8_t z1,
    const CRGB& color) {
  int8_t dx = abs(x1 - x0);
  int8_t dy = abs(y1 - y0);
  int8_t dz = abs(z1 - z0);
  int8_t sx = (x1 >= x0) ? 1 : -1;
  int8_t sy = (y1 >= y0) ? 1 : -1;
  int8_t sz = (z1 >= z0) ? 1 : -1;

  addVoxel(x0, y0, z0, color);

  if (dx >= dy && dx >= dz) {
    int16_t p1 = 2 * dy - dx;
    int16_t p2 = 2 * dz - dx;
    while (x0 != x1) {
      x0 += sx;
      if (p1 >= 0) { y0 += sy; p1 -= 2 * dx; }
      if (p2 >= 0) { z0 += sz; p2 -= 2 * dx; }
      p1 += 2 * dy;
      p2 += 2 * dz;
      addVoxel(x0, y0, z0, color);
    }
  } else if (dy >= dx && dy >= dz) {
    int16_t p1 = 2 * dx - dy;
    int16_t p2 = 2 * dz - dy;
    while (y0 != y1) {
      y0 += sy;
      if (p1 >= 0) { x0 += sx; p1 -= 2 * dy; }
      if (p2 >= 0) { z0 += sz; p2 -= 2 * dy; }
      p1 += 2 * dx;
      p2 += 2 * dz;
      addVoxel(x0, y0, z0, color);
    }
  } else {
    int16_t p1 = 2 * dy - dz;
    int16_t p2 = 2 * dx - dz;
    while (z0 != z1) {
      z0 += sz;
      if (p1 >= 0) { y0 += sy; p1 -= 2 * dz; }
      if (p2 >= 0) { x0 += sx; p2 -= 2 * dz; }
      p1 += 2 * dy;
      p2 += 2 * dx;
      addVoxel(x0, y0, z0, color);
    }
  }
}

static __attribute__((noinline)) void rotatePoint3D(
    int16_t px, int16_t py, int16_t pz,
    uint8_t ax, uint8_t ay, uint8_t az,
    int8_t& ox, int8_t& oy, int8_t& oz) {
  int16_t y1 = (int16_t)(((int32_t)py * c8(ax) - (int32_t)pz * s8(ax)) >> 7);
  int16_t z1 = (int16_t)(((int32_t)py * s8(ax) + (int32_t)pz * c8(ax)) >> 7);

  int16_t x2 = (int16_t)(((int32_t)px * c8(ay) + (int32_t)z1 * s8(ay)) >> 7);
  int16_t z2 = (int16_t)(((int32_t)z1 * c8(ay) - (int32_t)px * s8(ay)) >> 7);

  int16_t x3 = (int16_t)(((int32_t)x2 * c8(az) - (int32_t)y1 * s8(az)) >> 7);
  int16_t y3 = (int16_t)(((int32_t)x2 * s8(az) + (int32_t)y1 * c8(az)) >> 7);

  // Convert Q8 centered around cube center (3.5) back to voxel coordinates 0..7
  ox = (int8_t)constrain((3 * 256 + 128 + x3 + 128) >> 8, 0, CUBE_SIZE - 1);
  oy = (int8_t)constrain((3 * 256 + 128 + y3 + 128) >> 8, 0, CUBE_SIZE - 1);
  oz = (int8_t)constrain((3 * 256 + 128 + z2 + 128) >> 8, 0, CUBE_SIZE - 1);
}

const char* EFFECT_NAMES[NUM_EFFECTS] = {
  "Rotating 3D Wireframe Cube",
  "3D Gyroscope Gimbals",
  "3D Lissajous Knot",
  "3D Spectrum Towers",
  "3D Intersecting Shockwaves",
  "3D Rotating Octahedron"
};

uint8_t gEffect = 0;
uint8_t gBrightness = 235;
uint16_t gFrame = 0;
uint8_t gTransitionFrames = 0;
bool gAutoCycle = true;
uint32_t gLastSwitchMs = 0;

uint8_t peakY[CUBE_SIZE][CUBE_SIZE];
uint8_t peakHold[CUBE_SIZE][CUBE_SIZE];

static const int8_t CUBE_CORNERS[8][3] = {
  {-1, -1, -1}, { 1, -1, -1}, { 1,  1, -1}, {-1,  1, -1},
  {-1, -1,  1}, { 1, -1,  1}, { 1,  1,  1}, {-1,  1,  1}
};

static const uint8_t CUBE_EDGES[12][2] = {
  {0, 1}, {1, 2}, {2, 3}, {3, 0},
  {4, 5}, {5, 6}, {6, 7}, {7, 4},
  {0, 4}, {1, 5}, {2, 6}, {3, 7}
};

// 1. Rotating 3D Wireframe Cube with glowing white corner vertices
void drawRotatingWireframe(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 115);

  int16_t halfScale = 580 + (((int16_t)sin8(t * 4) - 128) * 140) / 128;
  uint8_t ax = (uint8_t)(t * 3);
  uint8_t ay = (uint8_t)(t * 4);
  uint8_t az = (uint8_t)(t * 2);

  int8_t vx[8], vy[8], vz[8];
  for (uint8_t i = 0; i < 8; i++) {
    int16_t lx = CUBE_CORNERS[i][0] < 0 ? -halfScale : halfScale;
    int16_t ly = CUBE_CORNERS[i][1] < 0 ? -halfScale : halfScale;
    int16_t lz = CUBE_CORNERS[i][2] < 0 ? -halfScale : halfScale;
    rotatePoint3D(lx, ly, lz, ax, ay, az, vx[i], vy[i], vz[i]);
  }

  CRGB edgeColor = CHSV((uint8_t)(t * 2), 240, 210);
  for (uint8_t e = 0; e < 12; e++) {
    uint8_t a = CUBE_EDGES[e][0];
    uint8_t b = CUBE_EDGES[e][1];
    drawLine3D(vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], edgeColor);
  }

  for (uint8_t i = 0; i < 8; i++) {
    setVoxel(vx[i], vy[i], vz[i], CRGB::White);
  }
}

// 2. 3D Gyroscope Gimbals: 3 nested orthogonal glowing rings rotating independently
void drawGyroscope(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 110);

  const int16_t radii[3] = { 820, 620, 420 };
  const uint8_t hues[3] = { 140, 96, 215 };

  for (uint8_t ring = 0; ring < 3; ring++) {
    uint8_t ax = (ring == 0) ? (uint8_t)(t * 4) : (uint8_t)(t * 2);
    uint8_t ay = (ring == 1) ? (uint8_t)(t * 5) : (uint8_t)(t * 3);
    uint8_t az = (ring == 2) ? (uint8_t)(t * 6) : 0;

    for (uint8_t step = 0; step < 24; step++) {
      uint8_t p = (uint8_t)((step * 256U) / 24U);
      int16_t lx = ((int32_t)c8(p) * radii[ring]) >> 7;
      int16_t ly = ((int32_t)s8(p) * radii[ring]) >> 7;
      int8_t rx, ry, rz;
      rotatePoint3D(lx, ly, 0, ax, ay, az, rx, ry, rz);
      addVoxel(rx, ry, rz, CHSV(hues[ring] + (uint8_t)(t >> 1), 240, 175));
    }
  }

  addSubVoxelQ8(3 * 256 + 128, 3 * 256 + 128, 3 * 256 + 128, CRGB(255, 240, 200));
}

// 3. 3D Lissajous Knot: continuous harmonic 3D curve with luminous rainbow persistence
void drawLissajousKnot(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 36);

  for (uint8_t sub = 0; sub < 3; sub++) {
    uint16_t u = t * 3 + sub;
    int16_t x8 = 3 * 256 + 128 + (((int16_t)sin8((uint8_t)(u * 3)) - 128) * 820) / 128;
    int16_t y8 = 3 * 256 + 128 + (((int16_t)sin8((uint8_t)(u * 2 + 64)) - 128) * 820) / 128;
    int16_t z8 = 3 * 256 + 128 + (((int16_t)sin8((uint8_t)(u * 5)) - 128) * 820) / 128;
    addSubVoxelQ8(x8, y8, z8, CHSV((uint8_t)(t * 3 + sub * 12), 245, 255));
  }
}

// 4. 3D Spectrum Towers: 8x8 equalizer columns with green -> yellow -> red gradient & peak caps
void drawSpectrumTowers(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 110);

  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    for (uint8_t x = 0; x < CUBE_SIZE; x++) {
      uint8_t n = inoise8(x * 58 + (t * 6), z * 58 - (t * 4), t * 9);
      uint8_t height = (uint8_t)constrain((uint16_t)(n >> 5), 1, CUBE_SIZE - 1);

      if (height >= peakY[z][x]) {
        peakY[z][x] = height;
        peakHold[z][x] = 6;
      } else if (peakHold[z][x] > 0) {
        peakHold[z][x]--;
      } else if (peakY[z][x] > height) {
        peakY[z][x]--;
      }

      for (uint8_t y = 0; y < height; y++) {
        uint8_t hue = (y < 4) ? (uint8_t)(96 - y * 16) : (uint8_t)(32 - (y - 4) * 10);
        setVoxel(x, y, z, CHSV(hue, 245, 195));
      }

      setVoxel(x, peakY[z][x], z, CRGB(235, 250, 255));
    }
  }
}

// 5. 3D Intersecting Shockwaves: orthogonal colored light planes flashing white at intersections
void drawIntersectingShockwaves(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 120);

  uint8_t px = scale8(sin8(t * 5), CUBE_SIZE - 1);
  uint8_t py = scale8(sin8(t * 4 + 85), CUBE_SIZE - 1);
  uint8_t pz = scale8(sin8(t * 6 + 170), CUBE_SIZE - 1);

  for (uint8_t a = 0; a < CUBE_SIZE; a++) {
    for (uint8_t b = 0; b < CUBE_SIZE; b++) {
      addVoxel(px, a, b, CRGB(0, 120, 210));
      addVoxel(a, py, b, CRGB(210, 60, 140));
      addVoxel(a, b, pz, CRGB(60, 200, 90));
    }
  }

  for (uint8_t i = 0; i < CUBE_SIZE; i++) {
    setVoxel(px, py, i, CRGB(220, 220, 255));
    setVoxel(px, i, pz, CRGB(200, 255, 220));
    setVoxel(i, py, pz, CRGB(255, 230, 210));
  }
  setVoxel(px, py, pz, CRGB::White);
}

// 6. 3D Rotating Octahedron: pulsing diamond wireframe rotating around Y with glowing core
void drawRotatingOctahedron(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 115);

  int16_t rad = 640 + (((int16_t)sin8(t * 5) - 128) * 180) / 128;
  uint8_t ax = (uint8_t)(t * 2);
  uint8_t ay = (uint8_t)(t * 5);

  const int16_t octLocal[6][3] = {
    {  0,  1,  0 },
    {  0, -1,  0 },
    {  1,  0,  0 },
    { -1,  0,  0 },
    {  0,  0,  1 },
    {  0,  0, -1 }
  };

  int8_t px[6], py[6], pz[6];
  for (uint8_t i = 0; i < 6; i++) {
    int16_t lx = octLocal[i][0] == 0 ? 0 : (octLocal[i][0] < 0 ? -rad : rad);
    int16_t ly = octLocal[i][1] == 0 ? 0 : (octLocal[i][1] < 0 ? -rad : rad);
    int16_t lz = octLocal[i][2] == 0 ? 0 : (octLocal[i][2] < 0 ? -rad : rad);
    rotatePoint3D(lx, ly, lz, ax, ay, 0, px[i], py[i], pz[i]);
  }

  CRGB cTop = CHSV((uint8_t)(t * 2), 240, 220);
  CRGB cEq  = CHSV((uint8_t)(t * 2 + 80), 240, 190);
  CRGB cBot = CHSV((uint8_t)(t * 2 + 160), 240, 220);

  for (uint8_t e = 2; e < 6; e++) {
    drawLine3D(px[0], py[0], pz[0], px[e], py[e], pz[e], cTop);
    drawLine3D(px[1], py[1], pz[1], px[e], py[e], pz[e], cBot);
  }

  drawLine3D(px[2], py[2], pz[2], px[4], py[4], pz[4], cEq);
  drawLine3D(px[4], py[4], pz[4], px[3], py[3], pz[3], cEq);
  drawLine3D(px[3], py[3], pz[3], px[5], py[5], pz[5], cEq);
  drawLine3D(px[5], py[5], pz[5], px[2], py[2], pz[2], cEq);

  for (uint8_t i = 0; i < 6; i++) {
    setVoxel(px[i], py[i], pz[i], CRGB::White);
  }
  addSubVoxelQ8(3 * 256 + 128, 3 * 256 + 128, 3 * 256 + 128, CRGB(255, 220, 160));
}

void selectEffect(uint8_t idx) {
  gEffect = idx % NUM_EFFECTS;
  gTransitionFrames = 8;
  gLastSwitchMs = millis();

  if (gEffect == 3) {
    memset(peakY, 0, sizeof(peakY));
    memset(peakHold, 0, sizeof(peakHold));
  }

  Serial.print(F("Effect ["));
  Serial.print(gEffect);
  Serial.print(F("]: "));
  Serial.println(EFFECT_NAMES[gEffect]);
}

void printHelp() {
  Serial.println(F("=== 3D Cube Geometry & Waveforms ==="));
  Serial.println(F("  n/p : Next / Prev   a : Auto-cycle   +/- : Brightness"));
  for (uint8_t i = 0; i < NUM_EFFECTS; i++) {
    Serial.print(F("  ["));
    Serial.print(i);
    Serial.print(F("] "));
    Serial.println(EFFECT_NAMES[i]);
  }
}

void handleSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == 'n' || c == 'N') {
      selectEffect((gEffect + 1) % NUM_EFFECTS);
    } else if (c == 'p' || c == 'P') {
      selectEffect((gEffect + NUM_EFFECTS - 1) % NUM_EFFECTS);
    } else if (c >= '0' && c <= '5') {
      selectEffect((uint8_t)(c - '0'));
    } else if (c == 'a' || c == 'A') {
      gAutoCycle = !gAutoCycle;
      gLastSwitchMs = millis();
      Serial.print(F("Auto-cycle: "));
      Serial.println(gAutoCycle ? F("ON") : F("OFF"));
    } else if (c == '+' || c == '=') {
      gBrightness = qadd8(gBrightness, 24);
      FastLED.setBrightness(gBrightness);
      Serial.print(F("Brightness: "));
      Serial.println(gBrightness);
    } else if (c == '-' || c == '_') {
      gBrightness = (gBrightness > 72) ? (gBrightness - 24) : 48;
      FastLED.setBrightness(gBrightness);
      Serial.print(F("Brightness: "));
      Serial.println(gBrightness);
    } else if (c == '?' || c == 'h' || c == 'H') {
      printHelp();
    }
  }
}

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(gBrightness);

  Serial.println(F("3D Cube Geometry & Waveforms ready. Type '?' for controls."));
  selectEffect(0);
  drawRotatingWireframe(0);
  FastLED.show();
}

void loop() {
  handleSerial();

  if (gAutoCycle && (millis() - gLastSwitchMs >= 7000UL)) {
    selectEffect((gEffect + 1) % NUM_EFFECTS);
  }

  EVERY_N_MILLISECONDS(35) {
    gFrame++;

    if (gTransitionFrames > 0) {
      fadeToBlackBy(leds, NUM_LEDS, 70);
      gTransitionFrames--;
    }

    switch (gEffect) {
      case 0: drawRotatingWireframe(gFrame); break;
      case 1: drawGyroscope(gFrame); break;
      case 2: drawLissajousKnot(gFrame); break;
      case 3: drawSpectrumTowers(gFrame); break;
      case 4: drawIntersectingShockwaves(gFrame); break;
      default: drawRotatingOctahedron(gFrame); break;
    }

    FastLED.show();
  }
}
