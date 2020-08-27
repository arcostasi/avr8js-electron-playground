import {
  LEDElement,
  BuzzerElement,
  ServoElement,
  SSD1306Element,
  LCD1602Element,
  NeopixelMatrixElement
} from '@wokwi/elements';

import { PinState } from 'avr8js';
import { buildHex } from "../shared/compile";
import { CPUPerformance } from '../shared/cpu-performance';
import { AVRRunner } from "../shared/execute";
import { formatTime } from "../shared/format-time";
import { Titlebar, Color } from 'custom-electron-titlebar'
import { EditorHistoryUtil } from '../shared/editor-history.util';
import { SSD1306Controller } from "../shared/ssd1306";
import { WS2812Controller } from "../shared/ws2812";
import { I2CBus } from "../shared/i2c-bus";
import { PITCHES_H } from "../shared/pitches";

import * as fs from "fs";

// Get Monaco Editor
declare function getEditor(): any;

// Add events to the buttons
const compileButton = document.querySelector("#compile-button");
compileButton.addEventListener("click", compileAndRun);

const runButton = document.querySelector("#run-button");
runButton.addEventListener("click", onlyRun);

const stopButton = document.querySelector("#stop-button");
stopButton.addEventListener("click", stopCode);

const clearButton = document.querySelector("#clear-button");
clearButton.addEventListener("click", clearOutput);

const statusLabel = document.querySelector("#status-label");
const statusLabelTimer = document.querySelector("#status-label-timer");
const statusLabelSpeed = document.querySelector("#status-label-speed");
const runnerOutputText = document.querySelector<HTMLElement>('#runner-output-text');

// Set up LEDs
const leds = document.querySelectorAll<LEDElement>("wokwi-led");

// Set up the LCD1602
const lcd1602 = document.querySelector<LCD1602Element & HTMLElement>(
  "wokwi-lcd1602"
);

// Set up the SSD1306
const ssd1306 = document.querySelector<SSD1306Element>(
  "wokwi-ssd1306"
);

// Set up the NeoPixel matrix
const matrix = document.querySelector<NeopixelMatrixElement>(
  "wokwi-neopixel-matrix"
);

// Set up the servo
const servo = document.querySelector<ServoElement>(
  "wokwi-servo"
);

// Set up the NeoPixel matrix
const buzzer = document.querySelector<BuzzerElement>(
  "wokwi-buzzer"
);


// Set up toolbar
let runner: AVRRunner;

function executeProgram(hex: string) {

  runner = new AVRRunner(hex);

  const cpuNanos = () => Math.round((runner.cpu.cycles / runner.frequency) * 1000000000);
  const cpuMillis = () => Math.round((runner.cpu.cycles / runner.frequency) * 1000);

  const cpuPerf = new CPUPerformance(runner.cpu, runner.frequency);

  const i2cBus = new I2CBus(runner.twi);

  const ssd1306Controller = new SSD1306Controller(cpuMillis);
  const matrixController = new WS2812Controller(matrix.cols * matrix.rows);

  let lastState = PinState.Input;

  let lastStateCycles = 0;
  let lastUpdateCycles = 0;
  let pwmHighCycles = 0;

  i2cBus.registerDevice(0x3d, ssd1306Controller);
  // i2cBus.registerDevice(0x27, lcd1602Controller);

  // Hook to PORTB register
  runner.portB.addListener(value => {
    [].forEach.call(leds, function(led: LEDElement) {
      const pin = parseInt(led.getAttribute("pin"), 10);
      led.value = value & (1 << (pin - 8)) ? true : false;
    });
  });

  // Hook to PORTC register
  runner.portC.addListener((value) => {
    //
  });

  // Hook to PORTD register
  runner.portD.addListener((value) => {
    // Feed the speaker
    // runner.speaker.feed(runner.portD.pinState(7));
    // buzzer.hasSignal = runner.portD.pinState(7) == PinState.High;

    // Feed the servo
    const pin6State = runner.portD.pinState(6);

    if (pin6State === PinState.High) {
      if (servo.angle < 90)
        servo.angle += 1;
    } else {
      if (servo.angle >= 0)
        servo.angle -= 1;
    }

    // Feed the  matrix
    matrixController.feedValue(runner.portD.pinState(3), cpuNanos());
  });

  // Connect to Serial port
  runner.usart.onByteTransmit = (value: number) => {
    runnerOutputText.textContent += String.fromCharCode(value);
  };

  // Connect to SPI
  runner.spi.onTransfer = (value: number) => {
    runnerOutputText.textContent += "SPI: 0x" + value.toString(16) + "\n";
    return value;
  };

  runner.execute((cpu) => {
    const time = formatTime(cpu.cycles / runner.frequency);
    const speed = (cpuPerf.update() * 100).toFixed(0);
    const frame = ssd1306Controller.update();
    const cyclesSinceUpdate = cpu.cycles - lastUpdateCycles;

    statusLabel.textContent = 'Simulation time: ';
    statusLabelTimer.textContent = `${time}`;
    statusLabelSpeed.textContent = `${speed}%`;

    if (frame) {
      ssd1306Controller.toImageData(ssd1306.imageData);
      ssd1306.redraw();
    }

    // Update NeoPixel matrix
    const pixels = matrixController.update(cpuNanos());

    if (pixels) {
      for (let row = 0; row < matrix.rows; row++) {
        for (let col = 0; col < matrix.cols; col++) {
          const value = pixels[row * matrix.cols + col];
          matrix.setPixel(row, col, {
            b: (value & 0xff) / 255,
            r: ((value >> 8) & 0xff) / 255,
            g: ((value >> 16) & 0xff) / 255
          });
        }
      }
    }

    pwmHighCycles = 0;

    lastUpdateCycles = cpu.cycles;
    lastStateCycles = cpu.cycles;
  });
}

async function compileAndRun() {

  storeUserSnippet();

  // Disable buttons
  compileButton.setAttribute('disabled', '1');
  runButton.setAttribute('disabled', '1');

  clearOutput();

  try {
    statusLabel.textContent = 'Compiling...';
    statusLabelTimer.textContent = '00:00.000';
    statusLabelSpeed.textContent = '0%';

    const result = await buildHex(getEditor().getValue(), [
      { name: "pitches.h", content: PITCHES_H }
    ]);

    runnerOutputText.textContent = result.stderr || result.stdout;

    if (result.hex) {
      // Save hex
      fs.writeFile('./firmware.hex', result.hex, function (err) {
          if (err) return console.log(err)
      });

      stopButton.removeAttribute('disabled');

      clearLeds();
      executeProgram(result.hex);
    } else {
      runButton.removeAttribute('disabled');
    }
  } catch (err) {
    runButton.removeAttribute('disabled');
    alert('Failed: ' + err);
  } finally {
    statusLabel.textContent = '';
  }
}

function storeUserSnippet() {
  EditorHistoryUtil.clearSnippet();
  EditorHistoryUtil.storeSnippet(getEditor().getValue());
}

function onlyRun() {
  fs.readFile('./firmware.hex', 'utf8', function(err, data) {
    if (err) {
      return console.log(err);
    }

    if (data) {
      stopButton.removeAttribute('disabled');
      runButton.setAttribute('disabled', '1');

      clearLeds();
      executeProgram(data);
    }
  });
}

function stopCode() {
  stopButton.setAttribute('disabled', '1');
  compileButton.removeAttribute('disabled');
  runButton.removeAttribute('disabled');

  if (runner) {
    runner.stop();
    runner = null;

    statusLabel.textContent = 'Stop simulation: ';
  }
}

function clearLeds() {
  [].forEach.call(leds, function(led: LEDElement) {
    const pin = parseInt(led.getAttribute("pin"), 10);
    led.value = false;
  });
}

function clearOutput() {
  runnerOutputText.textContent = '';
}

// Change titlebar color
new Titlebar({
    backgroundColor: Color.fromHex('#444')
});

