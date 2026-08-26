/*
  8x8x8 3D RGB LED Cube — 10 Volumetric Effects (FastLED + Wokwi Custom View)
  Custom View URL: http://localhost:3000/?size=8
  Compatible with FastLED 3.x+ on Arduino Mega 2560 (Data pin 3, 512 NeoPixels)

  Serial Monitor Controls (115200 baud):
    n / p : Next / Previous effect
    0 - 9 : Jump directly to an effect
    a     : Toggle auto-cycle
    + / - : Adjust brightness
    ?     : Print command help & effect list
*/
#define FASTLED_INTERNAL
#include <FastLED.h>

#define CUBE_SIZE 8
#define NUM_LEDS (CUBE_SIZE * CUBE_SIZE * CUBE_SIZE)
#define DATA_PIN 3
#define NUM_EFFECTS 10

CRGB leds[NUM_LEDS];

static inline uint16_t XYZ(uint8_t x, uint8_t y, uint8_t z) {
  return (uint16_t)z * (CUBE_SIZE * CUBE_SIZE) + (uint16_t)y * CUBE_SIZE + x;
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

// Smoothly distributes a 16-bit Q8.8 fixed-point coordinate across up to 8 neighboring voxels
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

const char* EFFECT_NAMES[NUM_EFFECTS] = {
  "Aurora Nebula 3D",
  "3D Interference Waves",
  "3D Lava Metaballs",
  "3D Fireworks Show",
  "Cyber Matrix Rain 3D",
  "DNA Double Helix 3D",
  "3D Plasma Vortex",
  "3D Breathing Wireframe",
  "Volumetric 3D Campfire",
  "3D Neon Light Ribbons"
};

uint8_t gEffect = 0;
uint8_t gBrightness = 230;
uint16_t gFrame = 0;
uint8_t gTransitionFrames = 0;
bool gAutoCycle = true;
uint32_t gLastSwitchMs = 0;

// State for Matrix Rain
int8_t rainY[CUBE_SIZE][CUBE_SIZE];
uint8_t rainSpeed[CUBE_SIZE][CUBE_SIZE];
uint8_t rainHue[CUBE_SIZE][CUBE_SIZE];

// State for Fireworks
#define FW_SPARKS 24
enum FwPhase : uint8_t { FW_IDLE = 0, FW_LAUNCH = 1, FW_BURST = 2 };
struct FireworkRocket {
  FwPhase phase;
  int16_t rx, ry, rz;     // Q8.8 position
  int16_t rvy;            // Q8.8 vertical speed
  uint8_t targetY;        // Q8 high byte threshold
  uint8_t hue;
  uint8_t age;
  int16_t sx[FW_SPARKS];
  int16_t sy[FW_SPARKS];
  int16_t sz[FW_SPARKS];
  int16_t vx[FW_SPARKS];
  int16_t vy[FW_SPARKS];
  int16_t vz[FW_SPARKS];
} fw;

// State for Neon Ribbons
#define NUM_RIBBONS 3
struct Ribbon {
  int16_t x, y, z;        // Q8.8
  int16_t vx, vy, vz;     // Q8.8
  uint8_t hue;
} ribbons[NUM_RIBBONS];

void spawnFirework() {
  fw.phase = FW_LAUNCH;
  fw.rx = (int16_t)(2 + random8(4)) * 256 + 128;
  fw.rz = (int16_t)(2 + random8(4)) * 256 + 128;
  fw.ry = 0;
  fw.rvy = 96 + random8(40);
  fw.targetY = 4 + random8(3);
  fw.hue = random8();
  fw.age = 0;
}

void initRibbons() {
  for (uint8_t i = 0; i < NUM_RIBBONS; i++) {
    ribbons[i].x = (int16_t)(1 + random8(6)) * 256;
    ribbons[i].y = (int16_t)(1 + random8(6)) * 256;
    ribbons[i].z = (int16_t)(1 + random8(6)) * 256;
    ribbons[i].vx = (int16_t)random8(45, 95) * (random8(2) ? 1 : -1);
    ribbons[i].vy = (int16_t)random8(45, 95) * (random8(2) ? 1 : -1);
    ribbons[i].vz = (int16_t)random8(45, 95) * (random8(2) ? 1 : -1);
    ribbons[i].hue = i * 85;
  }
}

void initMatrixRain() {
  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    for (uint8_t x = 0; x < CUBE_SIZE; x++) {
      rainY[z][x] = (int8_t)random8(CUBE_SIZE * 2);
      rainSpeed[z][x] = 1 + random8(3);
      rainHue[z][x] = (random8(12) == 0) ? 132 : 96; // mostly green, occasional cyan stream
    }
  }
}

// 1. Aurora Nebula 3D: volumetric 3D simplex noise with dark negative space
void drawAuroraNebula(uint16_t t) {
  uint16_t zOff = t * 14;
  uint16_t yOff = t * 8;
  uint8_t hueBase = (uint8_t)(t >> 1);

  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    for (uint8_t y = 0; y < CUBE_SIZE; y++) {
      for (uint8_t x = 0; x < CUBE_SIZE; x++) {
        uint8_t n = inoise8(x * 46, y * 46 + yOff, z * 46 + zOff);
        if (n < 118) {
          leds[XYZ(x, y, z)].nscale8(190);
          continue;
        }
        uint8_t bri = qsub8(n, 118);
        bri = qadd8(scale8(bri, 220), 40);
        uint8_t hue = hueBase + (y * 14) + scale8(n, 70);
        leds[XYZ(x, y, z)] = ColorFromPalette(OceanColors_p, hue, bri, LINEARBLEND);
        if (n > 195) {
          leds[XYZ(x, y, z)] += CHSV(hue + 96, 200, (uint8_t)((n - 195) * 3));
        }
      }
    }
  }
}

// 2. 3D Interference Waves: two orbiting emitters interfering across XZ with soft Y glow
void drawInterferenceWaves(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 96);

  int16_t sx1 = (int16_t)(38 + (((int16_t)cos8(t * 2) - 128) / 4)); // 0..76 (~x*10)
  int16_t sz1 = (int16_t)(38 + (((int16_t)sin8(t * 2) - 128) / 4));
  int16_t sx2 = (int16_t)(38 - (((int16_t)cos8(t * 2) - 128) / 4));
  int16_t sz2 = (int16_t)(38 - (((int16_t)sin8(t * 2) - 128) / 4));

  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    int16_t z10 = (int16_t)z * 10 + 4;
    for (uint8_t x = 0; x < CUBE_SIZE; x++) {
      int16_t x10 = (int16_t)x * 10 + 4;
      int16_t dx1 = x10 - sx1;
      int16_t dz1 = z10 - sz1;
      int16_t dx2 = x10 - sx2;
      int16_t dz2 = z10 - sz2;

      uint16_t d1 = sqrt16((uint16_t)(dx1 * dx1 + dz1 * dz1));
      uint16_t d2 = sqrt16((uint16_t)(dx2 * dx2 + dz2 * dz2));

      uint8_t w1 = sin8((uint8_t)(d1 * 5 - t * 9));
      uint8_t w2 = sin8((uint8_t)(d2 * 5 - t * 9));
      uint16_t combined = ((uint16_t)w1 + (uint16_t)w2) >> 1;

      int16_t y8 = (int16_t)((combined * (CUBE_SIZE - 1) * 256UL) / 255UL);
      uint8_t hue = (uint8_t)(128 + (combined >> 1) + (t >> 1));
      addSubVoxelQ8((int16_t)x * 256, y8, (int16_t)z * 256, CHSV(hue, 240, 255));
    }
  }
}

// 3. 3D Lava Metaballs: three orbiting glowing energy spheres merging via inverse-distance field
void drawMetaballs(uint16_t t) {
  int16_t bx[3], by[3], bz[3];
  bx[0] = 35 + (((int16_t)sin8(t * 3) - 128) * 28) / 128;
  by[0] = 35 + (((int16_t)cos8(t * 2) - 128) * 26) / 128;
  bz[0] = 35 + (((int16_t)sin8(t * 2 + 64) - 128) * 28) / 128;

  bx[1] = 35 + (((int16_t)cos8(t * 2 + 85) - 128) * 28) / 128;
  by[1] = 35 + (((int16_t)sin8(t * 4 + 40) - 128) * 26) / 128;
  bz[1] = 35 + (((int16_t)cos8(t * 3 + 120) - 128) * 28) / 128;

  bx[2] = 35 + (((int16_t)sin8(t * 4 + 170) - 128) * 26) / 128;
  by[2] = 35 + (((int16_t)cos8(t * 3 + 190) - 128) * 28) / 128;
  bz[2] = 35 + (((int16_t)sin8(t * 2 + 210) - 128) * 26) / 128;

  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    int16_t pz = (int16_t)z * 10;
    for (uint8_t y = 0; y < CUBE_SIZE; y++) {
      int16_t py = (int16_t)y * 10;
      for (uint8_t x = 0; x < CUBE_SIZE; x++) {
        int16_t px = (int16_t)x * 10;
        uint16_t energy = 0;
        for (uint8_t b = 0; b < 3; b++) {
          int16_t dx = px - bx[b];
          int16_t dy = py - by[b];
          int16_t dz = pz - bz[b];
          uint16_t dist2 = (uint16_t)(dx * dx + dy * dy + dz * dz) + 90;
          energy += 9500U / dist2;
        }
        if (energy < 18) {
          leds[XYZ(x, y, z)] = CRGB::Black;
        } else {
          uint8_t lvl = (energy > 64) ? 255 : (uint8_t)((energy - 18) * 5 + 25);
          CRGB c = ColorFromPalette(HeatColors_p, lvl, lvl, LINEARBLEND);
          if (lvl > 200) {
            c += CHSV((uint8_t)(t + energy), 120, (uint8_t)(lvl - 180));
          }
          leds[XYZ(x, y, z)] = c;
        }
      }
    }
  }
}

// 4. 3D Fireworks Show: launching golden rocket + 24 gravity sparks with twinkling fade
void drawFireworks(uint16_t t) {
  (void)t;
  fadeToBlackBy(leds, NUM_LEDS, 64);

  if (fw.phase == FW_IDLE) {
    spawnFirework();
  }

  if (fw.phase == FW_LAUNCH) {
    fw.ry += fw.rvy;
    addSubVoxelQ8(fw.rx, fw.ry, fw.rz, CRGB(255, 220, 140));
    if ((fw.ry >> 8) >= fw.targetY) {
      fw.phase = FW_BURST;
      fw.age = 0;
      for (uint8_t i = 0; i < FW_SPARKS; i++) {
        uint8_t theta = random8();
        uint8_t phi = random8();
        int16_t speed = 72 + random8(64);
        int16_t sinPhi = (int16_t)sin8(phi) - 128;
        int16_t cosPhi = (int16_t)cos8(phi) - 128;
        int16_t sinTh = (int16_t)sin8(theta) - 128;
        int16_t cosTh = (int16_t)cos8(theta) - 128;

        fw.sx[i] = fw.rx;
        fw.sy[i] = fw.ry;
        fw.sz[i] = fw.rz;
        fw.vx[i] = (int16_t)((((int32_t)speed * cosPhi) >> 7) * cosTh >> 7);
        fw.vy[i] = (int16_t)(((int32_t)speed * sinPhi) >> 7) + 25;
        fw.vz[i] = (int16_t)((((int32_t)speed * cosPhi) >> 7) * sinTh >> 7);
      }
    }
    return;
  }

  // Burst phase
  fw.age++;
  uint8_t decay = (fw.age < 38) ? (uint8_t)(255 - fw.age * 6) : 0;
  for (uint8_t i = 0; i < FW_SPARKS; i++) {
    fw.sx[i] += fw.vx[i];
    fw.sy[i] += fw.vy[i];
    fw.sz[i] += fw.vz[i];
    fw.vy[i] -= 4; // gravity
    fw.vx[i] = (fw.vx[i] * 15) >> 4;
    fw.vz[i] = (fw.vz[i] * 15) >> 4;

    if (fw.age > 16 && random8(5) == 0) continue; // sparkle flicker
    uint8_t hue = fw.hue + (i * 5) + (fw.age * 2);
    CRGB sc = (fw.age < 5) ? CRGB(255, 250, 220) : CHSV(hue, 240, decay);
    addSubVoxelQ8(fw.sx[i], fw.sy[i], fw.sz[i], sc);
  }

  if (fw.age >= 40) {
    spawnFirework();
  }
}

// 5. Cyber Matrix Rain 3D: variable-speed columns with bright white heads and glowing tails
void drawMatrixRain(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 62);

  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    for (uint8_t x = 0; x < CUBE_SIZE; x++) {
      if ((t % rainSpeed[z][x]) != 0) continue;

      rainY[z][x]--;
      if (rainY[z][x] < -4) {
        rainY[z][x] = CUBE_SIZE + random8(8);
        rainSpeed[z][x] = 1 + random8(3);
        rainHue[z][x] = (random8(10) == 0) ? 136 : 96;
      }

      int8_t y = rainY[z][x];
      if (y >= 0 && y < CUBE_SIZE) {
        setVoxel(x, y, z, CRGB(200, 255, 225)); // glowing white-mint head
      }
      if (y + 1 >= 0 && y + 1 < CUBE_SIZE) {
        setVoxel(x, y + 1, z, CHSV(rainHue[z][x], 240, 220));
      }
      if (y + 2 >= 0 && y + 2 < CUBE_SIZE) {
        setVoxel(x, y + 2, z, CHSV(rainHue[z][x], 255, 110));
      }
    }
  }
}

// 6. DNA Double Helix 3D: two smooth spiraling strands connected by base-pair rungs
void drawDoubleHelix(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 115);

  for (uint8_t y = 0; y < CUBE_SIZE; y++) {
    uint8_t angle1 = (uint8_t)(y * 26 + t * 5);
    uint8_t angle2 = angle1 + 128;

    int16_t x1_8 = 3 * 256 + 128 + (((int16_t)sin8(angle1) - 128) * 768) / 128;
    int16_t z1_8 = 3 * 256 + 128 + (((int16_t)cos8(angle1) - 128) * 768) / 128;
    int16_t x2_8 = 3 * 256 + 128 + (((int16_t)sin8(angle2) - 128) * 768) / 128;
    int16_t z2_8 = 3 * 256 + 128 + (((int16_t)cos8(angle2) - 128) * 768) / 128;

    // Base-pair rung every other layer
    if ((y & 1) == 0) {
      int8_t rx1 = (int8_t)((x1_8 + 128) >> 8);
      int8_t rz1 = (int8_t)((z1_8 + 128) >> 8);
      int8_t rx2 = (int8_t)((x2_8 + 128) >> 8);
      int8_t rz2 = (int8_t)((z2_8 + 128) >> 8);
      drawLine3D(rx1, y, rz1, rx2, y, rz2, CHSV((uint8_t)(t * 2 + y * 24), 190, 85));
    }

    addSubVoxelQ8(x1_8, (int16_t)y * 256, z1_8, CHSV((uint8_t)(t + y * 16), 255, 255));
    addSubVoxelQ8(x2_8, (int16_t)y * 256, z2_8, CHSV((uint8_t)(t + 128 + y * 16), 255, 255));
  }
}

// 7. 3D Plasma Vortex: expanding swirling conical tornado with ascending particles
void drawPlasmaVortex(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 88);

  for (uint8_t y = 0; y < CUBE_SIZE; y++) {
    int16_t radius8 = 160 + (int16_t)y * 105; // wider toward top
    for (uint8_t arm = 0; arm < 2; arm++) {
      uint8_t a = (uint8_t)(t * 8 - y * 30 + arm * 128);
      int16_t x8 = 3 * 256 + 128 + (((int32_t)((int16_t)cos8(a) - 128) * radius8) >> 7);
      int16_t z8 = 3 * 256 + 128 + (((int32_t)((int16_t)sin8(a) - 128) * radius8) >> 7);
      uint8_t hue = (uint8_t)(138 + y * 14 + arm * 28 + (t >> 1));
      addSubVoxelQ8(x8, (int16_t)y * 256, z8, CHSV(hue, 240, 235));
    }
  }

  // Rising spark along central core
  uint8_t sparkY = (t >> 1) & 0x07;
  uint8_t sa = (uint8_t)(t * 13);
  int16_t sx8 = 3 * 256 + 128 + (((int16_t)sin8(sa) - 128) * (80 + sparkY * 70)) / 128;
  int16_t sz8 = 3 * 256 + 128 + (((int16_t)cos8(sa) - 128) * (80 + sparkY * 70)) / 128;
  addSubVoxelQ8(sx8, (int16_t)sparkY * 256, sz8, CRGB(220, 255, 255));
}

// 8. 3D Breathing Wireframe: nested pulsing cubes with glowing vertices
void drawBreathingWireframe(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 110);

  uint8_t outerStep = scale8(sin8(t * 4), 3); // 0..3 -> half-size 3..0
  uint8_t innerStep = scale8(sin8(t * 4 + 128), 3);

  uint8_t steps[2] = { outerStep, innerStep };
  uint8_t hues[2] = { (uint8_t)(t * 2), (uint8_t)(t * 2 + 128) };

  for (uint8_t c = 0; c < 2; c++) {
    int8_t lo = (int8_t)steps[c];
    int8_t hi = (CUBE_SIZE - 1) - lo;
    CRGB edge = CHSV(hues[c], 245, 190);
    CRGB corner = CRGB::White;

    if (lo == hi) {
      setVoxel(lo, lo, lo, corner);
      continue;
    }

    drawLine3D(lo, lo, lo, hi, lo, lo, edge);
    drawLine3D(hi, lo, lo, hi, lo, hi, edge);
    drawLine3D(hi, lo, hi, lo, lo, hi, edge);
    drawLine3D(lo, lo, hi, lo, lo, lo, edge);

    drawLine3D(lo, hi, lo, hi, hi, lo, edge);
    drawLine3D(hi, hi, lo, hi, hi, hi, edge);
    drawLine3D(hi, hi, hi, lo, hi, hi, edge);
    drawLine3D(lo, hi, hi, lo, hi, lo, edge);

    drawLine3D(lo, lo, lo, lo, hi, lo, edge);
    drawLine3D(hi, lo, lo, hi, hi, lo, edge);
    drawLine3D(hi, lo, hi, hi, hi, hi, edge);
    drawLine3D(lo, lo, hi, lo, hi, hi, edge);

    for (uint8_t mask = 0; mask < 8; mask++) {
      setVoxel((mask & 1) ? hi : lo, (mask & 2) ? hi : lo, (mask & 4) ? hi : lo, corner);
    }
  }
}

// 9. Volumetric 3D Campfire: turbulent rising flame column + floating ember sparks
void drawCampfire3D(uint16_t t) {
  uint16_t rise = t * 28;
  for (uint8_t z = 0; z < CUBE_SIZE; z++) {
    int8_t dz = (int8_t)(z * 2) - 7;
    for (uint8_t y = 0; y < CUBE_SIZE; y++) {
      for (uint8_t x = 0; x < CUBE_SIZE; x++) {
        int8_t dx = (int8_t)(x * 2) - 7;
        uint8_t rad = (uint8_t)sqrt16((uint16_t)(dx * dx + dz * dz) * 8);
        uint8_t noise = inoise8(x * 55, y * 48 - rise, z * 55 + (t * 7));
        int16_t heat = (int16_t)noise - (int16_t)(y * 22) - (int16_t)(rad * 3) + 60;
        if (heat <= 18) {
          leds[XYZ(x, y, z)].nscale8(150);
        } else {
          uint8_t h = (heat > 255) ? 255 : (uint8_t)heat;
          leds[XYZ(x, y, z)] = ColorFromPalette(HeatColors_p, h, qadd8(scale8(h, 210), 40), LINEARBLEND);
        }
      }
    }
  }

  // Occasional rising ember near the upper layers
  if (random8(3) == 0) {
    uint8_t ex = 2 + random8(4);
    uint8_t ez = 2 + random8(4);
    uint8_t ey = 5 + random8(3);
    addVoxel(ex, ey, ez, CRGB(255, 190, 60));
  }
}

// 10. 3D Neon Light Ribbons: autonomous 3D light trails bouncing smoothly in the cube
void drawNeonRibbons(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 36);

  for (uint8_t i = 0; i < NUM_RIBBONS; i++) {
    Ribbon& r = ribbons[i];
    r.x += r.vx;
    r.y += r.vy;
    r.z += r.vz;

    if (r.x <= 64) { r.x = 64; r.vx = abs(r.vx); }
    else if (r.x >= 1720) { r.x = 1720; r.vx = -abs(r.vx); }

    if (r.y <= 64) { r.y = 64; r.vy = abs(r.vy); }
    else if (r.y >= 1720) { r.y = 1720; r.vy = -abs(r.vy); }

    if (r.z <= 64) { r.z = 64; r.vz = abs(r.vz); }
    else if (r.z >= 1720) { r.z = 1720; r.vz = -abs(r.vz); }

    if ((t & 7) == i) {
      r.vx = constrain(r.vx + (int16_t)random8(29) - 14, -120, 120);
      r.vy = constrain(r.vy + (int16_t)random8(29) - 14, -120, 120);
      r.vz = constrain(r.vz + (int16_t)random8(29) - 14, -120, 120);
      if (abs(r.vx) + abs(r.vy) + abs(r.vz) < 70) {
        r.vx = 85;
      }
    }

    r.hue += 2;
    addSubVoxelQ8(r.x, r.y, r.z, CHSV(r.hue, 240, 255));
  }
}

void selectEffect(uint8_t idx) {
  gEffect = idx % NUM_EFFECTS;
  gTransitionFrames = 8;
  gLastSwitchMs = millis();

  if (gEffect == 3) spawnFirework();
  if (gEffect == 4) initMatrixRain();
  if (gEffect == 9) initRibbons();

  Serial.print(F("Effect ["));
  Serial.print(gEffect);
  Serial.print(F("]: "));
  Serial.println(EFFECT_NAMES[gEffect]);
}

void printHelp() {
  Serial.println(F("=== 3D LED Cube Controls ==="));
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
    } else if (c >= '0' && c <= '9') {
      uint8_t idx = (uint8_t)(c - '0');
      if (idx < NUM_EFFECTS) selectEffect(idx);
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

  initMatrixRain();
  initRibbons();
  spawnFirework();

  Serial.println(F("3D LED Cube 8x8x8 ready. Type '?' for controls."));
  selectEffect(0);
  drawAuroraNebula(0);
  FastLED.show();
}

void loop() {
  handleSerial();

  if (gAutoCycle && (millis() - gLastSwitchMs >= 6000UL)) {
    selectEffect((gEffect + 1) % NUM_EFFECTS);
  }

  EVERY_N_MILLISECONDS(35) {
    gFrame++;

    if (gTransitionFrames > 0) {
      fadeToBlackBy(leds, NUM_LEDS, 70);
      gTransitionFrames--;
    }

    switch (gEffect) {
      case 0: drawAuroraNebula(gFrame); break;
      case 1: drawInterferenceWaves(gFrame); break;
      case 2: drawMetaballs(gFrame); break;
      case 3: drawFireworks(gFrame); break;
      case 4: drawMatrixRain(gFrame); break;
      case 5: drawDoubleHelix(gFrame); break;
      case 6: drawPlasmaVortex(gFrame); break;
      case 7: drawBreathingWireframe(gFrame); break;
      case 8: drawCampfire3D(gFrame); break;
      default: drawNeonRibbons(gFrame); break;
    }

    FastLED.show();
  }
}
