# AVR8js Electron Playground

A full-featured **Arduino simulator** built with [AVR8js](https://github.com/wokwi/avr8js), [Wokwi Elements](https://github.com/wokwi/wokwi-elements), and [Electron](https://github.com/electron/electron). Write Arduino code, design circuits visually, and simulate everything in real time — all offline in a native desktop application.

See [ROADMAP.md](ROADMAP.md) for the phased plan to expand the simulator and improve AVR8 architecture coverage, and [BACKLOG.md](BACKLOG.md) for the prioritized execution backlog.

<img src="examples/print.png" alt="AVR8js Electron Playground Screenshot" width="900px">

---

## Features

### Editor and Project Workflow
- **Monaco Editor** with lazy language loading, model reuse, view-state restore, and diagnostics markers
- Tabbed multi-file editing for sketches, diagrams, chip sources, manifests, and support files
- Async project discovery/load/import/export in the Electron main process with cancellation and progress reporting
- Per-project UI session restore for active file, open tabs, sidebar sections, terminal state, diagnostics state, compile history, and layout

### Simulator and Diagram UX
- Visual circuit editor with drag-and-drop components, wire routing, pan/zoom, undo/redo, and autosave
- Real-time simulation using **avr8js** with GPIO, ADC, timers, USART, SPI, TWI/I2C, EEPROM, and component bridges
- Property editor for live sensor/device tuning during simulation
- Improved startup and runtime responsiveness with cached project metadata, preloading, segmented terminal buffers, and simulation setup caching

### Terminal, Diagnostics, and Recovery
- Serial Monitor, Plotter, Chips, History, and Diagnostics tabs in one bottom panel
- Chip build diagnostics with file/line navigation, quick filters, expandable details, and restore-aware warnings
- Compile history persistence per project, including expanded details and restored truncation summaries
- Session restore warnings that can be dismissed per project and reopened later for debugging

### Custom Chips
- Build and run custom chips (`.chip.c/.cpp` + `.chip.json` + `.chip.wasm`) inside the simulator
- External and embedded-experimental build backends with build cache, diagnostics parsing, and reusable WASM artifacts
- Runtime bridges for GPIO, I2C, UART, SPI, timing, controls, attributes, and framebuffer-style output

### Performance and Persistence
- Dedicated **Performance Mode** with live metrics panel, regression thresholds, snapshot export/import, and local baselines
- Renderer persistence backed by main-process storage IPC for UI session, chip cache, and perf-panel data
- Smoke performance tests for project discovery/load, diagram parse, and netlist build

### Supported Components

| Category | Components |
|----------|-----------|
| **Boards** | Arduino Uno, Nano, Mega
| **Output** | LED, RGB LED, Buzzer, Relay, LED Bar Graph, 7-Segment, Servo, Stepper Motor |
| **Display** | LCD 1602 (I2C), LCD 2004 (I2C), SSD1306 OLED (I2C), ILI9341, NeoPixel, NeoPixel Matrix, LED Ring |
| **Input** | Pushbutton, Pushbutton 6mm, Slide Switch, Tilt Switch, DIP Switch 8, Membrane Keypad, Rotary Encoder (KY-040), Rotary Dialer, Analog Joystick |
| **Analog** | Potentiometer, Slide Potentiometer |
| **Sensors** | DHT22, HC-SR04, NTC Temperature, Photoresistor, Flame, Big/Small Sound, PIR Motion, Heart Beat, Gas Sensor, MPU6050, HX711 |
| **Communication** | IR Receiver, IR Remote, DS1307 RTC, microSD Card |
| **Passive** | Resistor |

### GPIO Routing (26 handlers)
All wired connections in `diagram.json` are automatically routed between Arduino pins and components:
- **Digital Output**: LED, RGB LED, Buzzer, Relay, LED Bar Graph, 7-Segment
- **Digital Input**: Pushbutton, Slide Switch, Tilt Switch, DIP Switch
- **Analog Input**: Potentiometer, Slide Potentiometer, Analog Joystick (ADC binding)
- **Sensors**: NTC (analog), Photoresistor/Flame/Sound (analog+digital), PIR/Heartbeat (digital)
- **Scan Matrix**: Membrane Keypad (row/column scanning)
- **Encoder**: Rotary Encoder (quadrature CLK/DT/SW)
- **PWM Output**: Servo (pulse width to angle), Stepper Motor (4-phase)
- **Dialer**: Rotary Dialer (pulse train)

### I2C Bus
- LCD 1602 (address `0x27`)
- LCD 2004 (address `0x27`)
- SSD1306 OLED (addresses `0x3C`, `0x3D`)
- DS1307 RTC (address `0x68`)

### Serial Monitor
- Full-duplex serial communication with the simulated Arduino
- Line ending options: Newline, Carriage Return, Both, None
- Timestamp toggle for incoming messages
- Auto-scroll with manual override
- Copy and clear controls
- Separate scroll/session restoration for Monitor, History, and Diagnostics views

### Diagnostics and History
- Dedicated Diagnostics tab for custom-chip build issues with severity and chip filters
- Click-to-open diagnostics, quick per-item filter actions, and expandable inspection details
- Persistent compile history with success/failure status, duration, and saved output
- Restore banners that explain when persisted logs were trimmed to stay within storage budgets

### Custom Chips (MVP)
- Build custom chips (`.chip.c/.cpp` + `.chip.json`) into WASM and run them inside the simulator
- `Build Chips` command (`F6`) plus automatic chip build before sketch compile (`F5`)
- Dedicated **Chips** tab for runtime/bridge logs
- Monaco diagnostics plus bottom-panel Diagnostics view for chip build errors with file/line mapping and jump-to-source
- Incremental chip build cache and persisted artifacts for faster rebuilds

**File convention**
- `mychip.chip.json` (manifest)
- `mychip.chip.c` or `mychip.chip.cpp` (source)
- `mychip.chip.wasm` (generated artifact)

**Supported runtime ABI (MVP)**
- Lifecycle: `chip_init()`, `chip_tick()`, `chip_dispose()`
- Time imports: `millis`/`avr8js_millis`, `micros`/`avr8js_micros`
- GPIO imports: `avr8js_gpio_read(pin)`, `avr8js_gpio_write(pin, value)`, `avr8js_gpio_mode(pin, mode)`
- I2C exports (optional): `chip_i2c_connect`, `chip_i2c_read`, `chip_i2c_write`, `chip_i2c_disconnect`
- Controls exports (optional): `chip_control_set/get` (or aliases `chip_set_control/get_control`)

**Build backends**
- `external` (default): command template in Settings (default: `clang --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -o "{{OUTPUT}}" "{{SOURCE}}"`)
- `embedded-experimental`: renderer-side embedded pipeline with fallback and support for:
	- `// @wasm-base64 <...>` test directive in `*.chip.c/*.chip.cpp`
	- reuse of existing `<name>.chip.wasm` from project files (with validation)

**Current limitations**
- Embedded backend is experimental and not yet a full C→WASM toolchain
- Compatibility target is MVP + core bridges (GPIO/I2C/controls), not full Chips API parity yet

### Component Property Editor
- Live adjustable sliders for sensor values during simulation
- Supported: DHT22 (temperature/humidity), HC-SR04 (distance), NTC (temperature), Photoresistor (light level), Flame/Sound/PIR/Heartbeat sensors

### Diagram Editor
- Add/remove components visually
- Wire color picker with 12 color options
- Undo/Redo with Ctrl+Z / Ctrl+Y (up to 100 history states)
- Auto-save diagram to disk (1-second debounce)
- Manual diagram.json editing synced with visual editor

### Project Management
- Auto-discovery of bundled examples plus external project roots
- Project metadata caching and cancellable async loading via the Electron main process
- Project export/import as `.avr8js` JSON bundles
- Last-opened project persistence and background preload of recent disk-backed projects

### Session Persistence
- Dedicated UI session storage for layout, tabs, terminal state, diagnostics filters, and restore context
- Separate persistence for chip build cache and performance panel data
- Restore-time warnings when large logs or history entries are trimmed during persistence

### Layout
- VS Code-inspired desktop layout with custom titlebar and resizable split panels
- Toggle sidebar, editor, and simulator independently
- Activity bar with quick toggles

### Performance Mode
- Live performance panel with operation timeline, domain summaries, regression thresholds, and cache counters
- Export/import of perf snapshots and saved local baselines for comparison across sessions
- Optional lightweight renderer memory metrics when exposed by Chromium

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Electron | 40.6.0 | Desktop shell |
| React | 19.2 | UI framework |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tool & bundler |
| avr8js | 0.21.0 | ATmega328p CPU emulator |
| @wokwi/elements | 1.9.2 | Circuit component web elements |
| Monaco Editor | 0.55.1 | Code editor |
| Zustand | 5 | State management |
| Tailwind CSS | 3.4 | Styling |
| Split.js | 1.6 | Resizable panels |
| Lucide React | 0.575 | Icon library |
| ESLint | 9 | Linting (0 errors) |
| Vitest | 4 | Testing |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm

### Install & Run

```bash
# Clone the repository
git clone https://github.com/arcostasi/avr8js-electron.git
cd avr8js-electron

# Install dependencies
npm install

# Development (build + launch)
npm run dev

# Or build and start manually
npm run build
npm start
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Build and launch in development mode |
| `npm run build` | Compile TypeScript + Vite build |
| `npm run watch` | Run the TypeScript compiler in watch mode |
| `npm start` | Launch the Electron app |
| `npm test` | Run the Vitest suite |
| `npm run test:perf-smoke` | Run loose performance smoke checks for discovery/load/parse/netlist |
| `npm run lint` | Run ESLint on all source files |
| `npm run lint:fix` | Auto-fix lint issues |

### Performance Validation

The repository includes a lightweight smoke benchmark for the main hot paths in the app:

- project discovery
- project load
- diagram parse/migration
- netlist build

Run it locally with:

```bash
npm run test:perf-smoke
```

The thresholds are intentionally loose and meant to catch obvious regressions, not replace profiling.

---

## Project Structure

```
avr8js-electron/
├── index.html                  # Electron renderer entry
├── vite.config.ts              # Vite build configuration
├── tsconfig.json               # TypeScript configuration
├── eslint.config.mjs           # ESLint flat config
├── tailwind.config.cjs         # Tailwind CSS configuration
├── examples/                   # Built-in simulator examples and custom-chip demos
├── src/
│   ├── main/                   # Electron main process
│   │   ├── main.ts             #   Window creation, IPC handlers, storage and project IPC
│   │   ├── project-io.ts       #   Async project discovery/load/import/export services
│   │   └── *.test.ts           #   Main-process tests and perf smoke checks
│   ├── electron/               # IPC infrastructure
│   │   ├── ipc-app.ts          #   App bootstrap
│   │   ├── ipc-channel.ts      #   Channel interface
│   │   ├── ipc-request.ts      #   Request types
│   │   ├── ipc-service.ts      #   Service base class
│   │   └── info-channel.ts     #   System info channel
│   ├── renderer/               # React UI (renderer process)
│   │   ├── App.tsx             #   Root component
│   │   ├── index.tsx           #   React mount point
│   │   ├── index.css           #   Global styles
│   │   ├── components/
│   │   │   ├── Editor.tsx      #   Monaco code editor
│   │   │   ├── PerformancePanel.tsx
│   │   │   ├── ProjectSidebar.tsx
│   │   │   ├── SerialMonitor.tsx
│   │   │   └── simulator/
│   │   │       ├── WokwiSimulator.tsx
│   │   │       ├── PartRenderer.tsx
│   │   │       ├── SimulatorToolbar.tsx
│   │   │       ├── AddComponentMenu.tsx
│   │   │       ├── CanvasZoomControls.tsx
│   │   │       ├── PinOverlay.tsx
│   │   │       ├── PinTooltip.tsx
│   │   │       ├── WireLayer.tsx
│   │   │       ├── WireColorPopup.tsx
│   │   │       └── ComponentPropertyEditor.tsx
│   │   ├── hooks/
│   │   │   ├── useSimulation.ts
│   │   │   ├── useDiagramState.ts    # Undo/redo history
│   │   │   ├── useAutoSave.ts
│   │   │   ├── useCanvasInteraction.ts
│   │   │   ├── usePinPositions.ts
│   │   │   ├── useResizableLayout.ts
│   │   │   └── useWireRenderer.tsx
│   │   ├── services/
│   │   │   ├── app-session.ts        #   Session snapshot/restore helpers
│   │   │   ├── chip-build-cache.ts
│   │   │   ├── chip-build-diagnostics.ts
│   │   │   ├── chip-build-embedded.ts
│   │   │   ├── custom-chips.ts
│   │   │   ├── gpio-router.ts
│   │   │   ├── netlist-builder.ts
│   │   │   ├── perf-dashboard.ts
│   │   │   ├── perf-panel-storage.ts
│   │   │   ├── project-export.ts
│   │   │   ├── project-loader.ts
│   │   │   ├── renderer-persist.ts
│   │   │   ├── simulation-engine.ts
│   │   │   └── ui-session.ts
│   │   ├── store/
│   │   │   ├── projectStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── constants/
│   │   │   └── wokwi-components.ts   # 49 component catalog
│   │   ├── types/
│   │   │   ├── editor-diagnostics.ts
│   │   │   └── wokwi.types.ts        # Diagram schema + V1→V2 migration
│   │   └── utils/
│   │       ├── catenary.ts           # Wire physics
│   │       ├── perf.ts               # Performance event stream and helpers
│   │       └── pin-mapping.ts        # Arduino pin → AVR port mapping
│   └── shared/                 # AVR simulation core
│       ├── execute.ts          #   AVRRunner (CPU lifecycle)
│       ├── compile.ts          #   Cloud hex compilation
│       ├── adc-registry.ts     #   ADC channel management
│       ├── i2c-bus.ts          #   I2C device multiplexer
│       ├── lcd1602.ts          #   LCD 16x2 controller
│       ├── lcd2004.ts          #   LCD 20x4 controller
│       ├── ssd1306.ts          #   SSD1306 OLED controller
│       ├── ws2812.ts           #   WS2812/NeoPixel controller
│       ├── dht22.ts            #   DHT22 sensor controller
│       ├── hc-sr04.ts          #   HC-SR04 ultrasonic controller
│       ├── ds1307.ts           #   DS1307 RTC controller
│       ├── ir.ts               #   NEC IR protocol
│       ├── speaker.ts          #   Speaker/buzzer audio
│       ├── stepper.ts          #   Stepper motor controller
│       ├── eeprom.ts           #   EEPROM persistence
│       ├── intelhex.ts         #   Intel HEX parser
│       ├── format-time.ts      #   Time formatting utility
│       ├── cpu-performance.ts  #   FPS/speed measurement
│       └── task-scheduler.ts   #   Cooperative task scheduler
```

---

## Example Projects

The `examples/` folder contains a broad set of working sketches and circuit demos, including:

| Example | Description |
|---------|-------------|
| `hello-world` | Classic LED blink starting point |
| `7segment`, `lcd2004`, `ssd1306`, `ili9341` | Display-oriented examples |
| `neopixel`, `neopixel-matrix`, `matrix8x8`, `matrix16x16`, `led-ring` | LED matrix and addressable LED demos |
| `servo`, `stepper-motor`, `buzzer`, `relay-module` | Actuator and output device examples |
| `dht22`, `hc-sr04`, `hx711`, `mpu6050`, `pir-motion`, `photoresistor` | Sensor integrations |
| `microsd-card`, `ds1307`, `ir-receiver` | Communication and peripheral examples |
| `custom-chip-*` | Custom chip API and runtime bridge demonstrations |

Every bundled example is intended to stay functional and directly runnable inside the app.

### Custom Chip API Examples

| Example | Main ABI / APIs Demonstrated |
|---------|-------------------------------|
| `custom-chip-gpio` | `pin_mode`, `pin_read`, `pin_write`, control bridge (`chip_control_set/get`) |
| `custom-chip-framebuffer` | `framebuffer_init`, `buffer_write` |
| `custom-chip-analog` | `pin_dac_write`, `pin_write` |
| `custom-chip-time` | `millis`, `micros` |
| `custom-chip-uart` | `uart_init`, `uart_write` |
| `custom-chip-i2c` | `chip_i2c_connect`, `chip_i2c_read`, `chip_i2c_write`, `chip_i2c_disconnect` |
| `custom-chip-spi` | `spi_init`, `spi_start` |
| `custom-chip-attributes` | `attr_init`, `attr_read` |

---

## License

- **AVR8js** & **Wokwi Elements**: [MIT License](https://github.com/wokwi/avr8js/blob/master/LICENSE)
- **Electron**: [MIT License](https://github.com/electron/electron/blob/master/LICENSE)
- **Monaco Editor**: [MIT License](https://github.com/microsoft/monaco-editor/blob/main/LICENSE.md)

When using the Electron or other GitHub logos, be sure to follow the [GitHub logo guidelines](https://github.com/logos).
