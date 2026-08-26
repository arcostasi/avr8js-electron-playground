/*
  8x8x8 3D RGB LED Cube — Fireworks & Cosmic Particles (FastLED + Wokwi Custom View)
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

const char* EFFECT_NAMES[NUM_EFFECTS] = {
  "Chrysanthemum Fireworks 3D",
  "Willow Cascade 3D",
  "Spiral Galaxy 3D",
  "3D Starfield Warp",
  "Solar System Orbits 3D",
  "Bioluminescent Fireflies 3D"
};

uint8_t gEffect = 0;
uint8_t gBrightness = 235;
uint16_t gFrame = 0;
uint8_t gTransitionFrames = 0;
bool gAutoCycle = true;
uint32_t gLastSwitchMs = 0;

// Shared firework particle buffer
#define MAX_SPARKS 28
struct Particle {
  int16_t x, y, z;
  int16_t vx, vy, vz;
  uint8_t hue;
  uint8_t life;
};

struct ShellState {
  bool launching;
  int16_t rx, ry, rz, rvy;
  uint8_t burstY;
  uint8_t coreHue;
  uint8_t tipHue;
  uint8_t age;
  Particle p[MAX_SPARKS];
} shell;

// Starfield state
#define NUM_STARS 22
struct Star {
  int16_t x8, y8, z8; // Q8.8 with x,y centered around 3.5*256
  int16_t vz;
  uint8_t hue;
} stars[NUM_STARS];

// Firefly state
#define NUM_FIREFLIES 10
struct Firefly {
  int16_t x, y, z;
  int16_t vx, vy, vz;
  uint8_t phase;
  uint8_t hue;
} fireflies[NUM_FIREFLIES];

void spawnShell(bool willowMode) {
  shell.launching = true;
  shell.rx = (int16_t)(2 + random8(4)) * 256 + 128;
  shell.rz = (int16_t)(2 + random8(4)) * 256 + 128;
  shell.ry = 0;
  shell.rvy = 92 + random8(36);
  shell.burstY = willowMode ? (5 + random8(2)) : (4 + random8(3));
  shell.coreHue = willowMode ? 32 : random8();
  shell.tipHue = willowMode ? 20 : (shell.coreHue + 96);
  shell.age = 0;
}

void explodeShell(bool willowMode) {
  shell.launching = false;
  shell.age = 0;
  for (uint8_t i = 0; i < MAX_SPARKS; i++) {
    uint8_t theta = random8();
    uint8_t phi = random8();
    bool innerShell = (!willowMode) && (i < MAX_SPARKS / 2);
    int16_t speed = willowMode
      ? (56 + random8(56))
      : (innerShell ? (54 + random8(26)) : (96 + random8(36)));

    int16_t sinPhi = (int16_t)sin8(phi) - 128;
    int16_t cosPhi = (int16_t)cos8(phi) - 128;
    int16_t sinTh = (int16_t)sin8(theta) - 128;
    int16_t cosTh = (int16_t)cos8(theta) - 128;

    shell.p[i].x = shell.rx;
    shell.p[i].y = shell.ry;
    shell.p[i].z = shell.rz;
    shell.p[i].vx = (int16_t)((((int32_t)speed * cosPhi) >> 7) * cosTh >> 7);
    shell.p[i].vy = (int16_t)(((int32_t)speed * sinPhi) >> 7) + (willowMode ? 32 : 18);
    shell.p[i].vz = (int16_t)((((int32_t)speed * cosPhi) >> 7) * sinTh >> 7);
    shell.p[i].hue = innerShell ? shell.coreHue : shell.tipHue;
    shell.p[i].life = willowMode ? 48 : 38;
  }
}

void initStars() {
  for (uint8_t i = 0; i < NUM_STARS; i++) {
    stars[i].x8 = (int16_t)(random8(CUBE_SIZE)) * 256 + 128;
    stars[i].y8 = (int16_t)(random8(CUBE_SIZE)) * 256 + 128;
    stars[i].z8 = (int16_t)(random8(CUBE_SIZE)) * 256;
    stars[i].vz = 75 + random8(85);
    stars[i].hue = 136 + random8(40);
  }
}

void initFireflies() {
  for (uint8_t i = 0; i < NUM_FIREFLIES; i++) {
    fireflies[i].x = (int16_t)(1 + random8(6)) * 256;
    fireflies[i].y = (int16_t)(1 + random8(6)) * 256;
    fireflies[i].z = (int16_t)(1 + random8(6)) * 256;
    fireflies[i].vx = (int16_t)random8(18, 42) * (random8(2) ? 1 : -1);
    fireflies[i].vy = (int16_t)random8(18, 42) * (random8(2) ? 1 : -1);
    fireflies[i].vz = (int16_t)random8(18, 42) * (random8(2) ? 1 : -1);
    fireflies[i].phase = random8();
    fireflies[i].hue = (i & 1) ? 74 : 112; // chartreuse & aqua glow
  }
}

// 1. Dual-shell Chrysanthemum Fireworks with outer glittering halo
void drawChrysanthemum(uint16_t t) {
  (void)t;
  fadeToBlackBy(leds, NUM_LEDS, 62);

  if (shell.launching) {
    shell.ry += shell.rvy;
    addSubVoxelQ8(shell.rx, shell.ry, shell.rz, CRGB(255, 225, 160));
    if ((shell.ry >> 8) >= shell.burstY) {
      explodeShell(false);
    }
    return;
  }

  shell.age++;
  for (uint8_t i = 0; i < MAX_SPARKS; i++) {
    Particle& pt = shell.p[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.z += pt.vz;
    pt.vy -= 4;
    pt.vx = (pt.vx * 14) >> 4;
    pt.vz = (pt.vz * 14) >> 4;

    if (shell.age > 20 && random8(4) == 0) continue; // glitter tips
    uint8_t bri = (shell.age < pt.life) ? (uint8_t)(255 - (shell.age * 240UL) / pt.life) : 0;
    CRGB c = (shell.age < 4) ? CRGB(CRGB::White) : CRGB(CHSV(pt.hue + shell.age, 235, bri));
    addSubVoxelQ8(pt.x, pt.y, pt.z, c);
  }

  if (shell.age >= 40) {
    spawnShell(false);
  }
}

// 2. Willow Cascade 3D: long golden-amber gravity-drooping curtains
void drawWillowCascade(uint16_t t) {
  (void)t;
  fadeToBlackBy(leds, NUM_LEDS, 42);

  if (shell.launching) {
    shell.ry += shell.rvy;
    addSubVoxelQ8(shell.rx, shell.ry, shell.rz, CRGB(255, 190, 90));
    if ((shell.ry >> 8) >= shell.burstY) {
      explodeShell(true);
    }
    return;
  }

  shell.age++;
  for (uint8_t i = 0; i < MAX_SPARKS; i++) {
    Particle& pt = shell.p[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.z += pt.vz;
    pt.vy -= 6;
    pt.vx = (pt.vx * 13) >> 4;
    pt.vz = (pt.vz * 13) >> 4;

    uint8_t bri = (shell.age < pt.life) ? (uint8_t)(255 - (shell.age * 245UL) / pt.life) : 0;
    uint8_t hue = (uint8_t)(38 - min((uint8_t)30, shell.age)); // gold -> deep ember red
    CRGB c = (shell.age < 3) ? CRGB(255, 240, 200) : CHSV(hue, 220, bri);
    addSubVoxelQ8(pt.x, pt.y, pt.z, c);
  }

  if (shell.age >= 48) {
    spawnShell(true);
  }
}

// 3. Spiral Galaxy 3D: tilted rotating 3-arm spiral disk with hot white core
void drawSpiralGalaxy(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 78);

  // Glowing galactic core at center
  addSubVoxelQ8(3 * 256 + 128, 3 * 256 + 128, 3 * 256 + 128, CRGB(255, 235, 195));

  uint8_t tiltSin = sin8(t >> 1);
  int16_t tiltFactor = ((int16_t)tiltSin - 128) >> 1; // gentle precession

  for (uint8_t arm = 0; arm < 3; arm++) {
    uint8_t baseAngle = (uint8_t)(arm * 85 - t * 4);
    for (uint8_t rStep = 1; rStep <= 6; rStep++) {
      uint8_t angle = baseAngle + rStep * 20;
      int16_t rad8 = (int16_t)rStep * 155;
      int16_t dx8 = ((int32_t)((int16_t)cos8(angle) - 128) * rad8) >> 7;
      int16_t dz8 = ((int32_t)((int16_t)sin8(angle) - 128) * rad8) >> 7;
      int16_t dy8 = ((int32_t)dx8 * tiltFactor) >> 8;

      uint8_t hue = 32 + rStep * 24 + (uint8_t)(t >> 2); // gold core -> cyan/violet arms
      uint8_t bri = 255 - rStep * 22;
      addSubVoxelQ8(3 * 256 + 128 + dx8, 3 * 256 + 128 + dy8, 3 * 256 + 128 + dz8, CHSV(hue, 220, bri));
    }
  }
}

// 4. 3D Starfield Warp: glowing stars accelerating toward viewer along Z
void drawStarfieldWarp(uint16_t t) {
  (void)t;
  fadeToBlackBy(leds, NUM_LEDS, 74);

  for (uint8_t i = 0; i < NUM_STARS; i++) {
    stars[i].z8 += stars[i].vz;
    if (stars[i].z8 >= CUBE_SIZE * 256) {
      stars[i].z8 = 0;
      stars[i].x8 = (int16_t)(random8(CUBE_SIZE)) * 256 + 128;
      stars[i].y8 = (int16_t)(random8(CUBE_SIZE)) * 256 + 128;
      stars[i].vz = 75 + random8(90);
      stars[i].hue = 132 + random8(48);
    }

    uint8_t depth = (uint8_t)constrain(stars[i].z8 >> 5, 45, 255);
    CRGB c = CHSV(stars[i].hue, (uint8_t)(220 - (depth >> 2)), depth);
    addSubVoxelQ8(stars[i].x8, stars[i].y8, stars[i].z8, c);
  }
}

// 5. Solar System Orbits 3D: pulsing sun + 3 inclined orbiting planets
void drawSolarSystem(uint16_t t) {
  fadeToBlackBy(leds, NUM_LEDS, 60);

  uint8_t sunPulse = qadd8(180, scale8(sin8(t * 7), 75));
  addSubVoxelQ8(3 * 256 + 128, 3 * 256 + 128, 3 * 256 + 128, CRGB(sunPulse, scale8(sunPulse, 175), 35));

  // Planet 1: fast inner cyan planet
  uint8_t a1 = (uint8_t)(t * 8);
  int16_t x1 = 3 * 256 + 128 + (((int16_t)cos8(a1) - 128) * 380) / 128;
  int16_t z1 = 3 * 256 + 128 + (((int16_t)sin8(a1) - 128) * 380) / 128;
  int16_t y1 = 3 * 256 + 128 + (((int16_t)sin8(a1) - 128) * 140) / 128;
  addSubVoxelQ8(x1, y1, z1, CRGB(80, 230, 255));

  // Planet 2: mid-orbit emerald planet on steep tilt
  uint8_t a2 = (uint8_t)(t * 5 + 90);
  int16_t x2 = 3 * 256 + 128 + (((int16_t)cos8(a2) - 128) * 640) / 128;
  int16_t z2 = 3 * 256 + 128 + (((int16_t)sin8(a2) - 128) * 640) / 128;
  int16_t y2 = 3 * 256 + 128 - (((int16_t)cos8(a2) - 128) * 320) / 128;
  addSubVoxelQ8(x2, y2, z2, CRGB(70, 255, 130));

  // Planet 3: outer magenta planet
  uint8_t a3 = (uint8_t)(t * 3 + 180);
  int16_t x3 = 3 * 256 + 128 + (((int16_t)cos8(a3) - 128) * 860) / 128;
  int16_t z3 = 3 * 256 + 128 + (((int16_t)sin8(a3) - 128) * 860) / 128;
  int16_t y3 = 3 * 256 + 128 + (((int16_t)sin8(a3 + 64) - 128) * 480) / 128;
  addSubVoxelQ8(x3, y3, z3, CRGB(240, 80, 255));
}

// 6. Bioluminescent Fireflies 3D: gentle organic glowing orbs drifting in dark space
void drawFireflies(uint16_t t) {
  (void)t;
  fadeToBlackBy(leds, NUM_LEDS, 52);

  for (uint8_t i = 0; i < NUM_FIREFLIES; i++) {
    Firefly& f = fireflies[i];
    f.x += f.vx;
    f.y += f.vy;
    f.z += f.vz;
    f.phase += 6;

    if (f.x <= 64) { f.x = 64; f.vx = abs(f.vx); }
    else if (f.x >= 1720) { f.x = 1720; f.vx = -abs(f.vx); }
    if (f.y <= 64) { f.y = 64; f.vy = abs(f.vy); }
    else if (f.y >= 1720) { f.y = 1720; f.vy = -abs(f.vy); }
    if (f.z <= 64) { f.z = 64; f.vz = abs(f.vz); }
    else if (f.z >= 1720) { f.z = 1720; f.vz = -abs(f.vz); }

    if (random8(12) == 0) {
      f.vx = constrain(f.vx + (int16_t)random8(17) - 8, -48, 48);
      f.vy = constrain(f.vy + (int16_t)random8(17) - 8, -48, 48);
      f.vz = constrain(f.vz + (int16_t)random8(17) - 8, -48, 48);
    }

    uint8_t bri = scale8(sin8(f.phase), 220) + 25;
    addSubVoxelQ8(f.x, f.y, f.z, CHSV(f.hue, 210, bri));
  }
}

void selectEffect(uint8_t idx) {
  gEffect = idx % NUM_EFFECTS;
  gTransitionFrames = 8;
  gLastSwitchMs = millis();

  if (gEffect == 0) spawnShell(false);
  if (gEffect == 1) spawnShell(true);
  if (gEffect == 3) initStars();
  if (gEffect == 5) initFireflies();

  Serial.print(F("Effect ["));
  Serial.print(gEffect);
  Serial.print(F("]: "));
  Serial.println(EFFECT_NAMES[gEffect]);
}

void printHelp() {
  Serial.println(F("=== 3D Cube Fireworks & Galaxy ==="));
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

  initStars();
  initFireflies();
  spawnShell(false);

  Serial.println(F("3D Cube Fireworks & Galaxy ready. Type '?' for controls."));
  selectEffect(0);
  drawChrysanthemum(0);
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
      case 0: drawChrysanthemum(gFrame); break;
      case 1: drawWillowCascade(gFrame); break;
      case 2: drawSpiralGalaxy(gFrame); break;
      case 3: drawStarfieldWarp(gFrame); break;
      case 4: drawSolarSystem(gFrame); break;
      default: drawFireflies(gFrame); break;
    }

    FastLED.show();
  }
}
