/**
 * Wokwi Component Catalog
 * Static list of all supported Wokwi components for the "Add Component" menu.
 */
import type { WokwiComponentDef } from '../types/wokwi.types';

export const COMMON_COMPONENTS: WokwiComponentDef[] = [
    { type: 'wokwi-7segment', label: '7 Segment', attrs: { color: 'red' } },
    { type: 'wokwi-analog-joystick', label: 'Analog Joystick' },
    { type: 'wokwi-arduino-mega', label: 'Arduino Mega' },
    { type: 'wokwi-arduino-nano', label: 'Arduino Nano' },
    { type: 'wokwi-arduino-uno', label: 'Arduino Uno' },
    { type: 'wokwi-big-sound-sensor', label: 'Big Sound Sensor' },
    { type: 'wokwi-buzzer', label: 'Buzzer' },
    { type: 'wokwi-dht22', label: 'DHT22' },
    { type: 'wokwi-dip-switch-8', label: 'DIP Switch 8' },
    { type: 'wokwi-ds1307', label: 'DS1307' },
    { type: 'wokwi-esp32-devkit-v1', label: 'ESP32 Devkit V1' },
    { type: 'wokwi-flame-sensor', label: 'Flame Sensor' },
    { type: 'wokwi-franzininho', label: 'Franzininho' },
    { type: 'wokwi-gas-sensor', label: 'Gas Sensor' },
    { type: 'wokwi-hc-sr04', label: 'HC-SR04' },
    { type: 'wokwi-heart-beat-sensor', label: 'Heart Beat Sensor' },
    { type: 'wokwi-hx711', label: 'HX711' },
    { type: 'wokwi-ili9341', label: 'ILI9341' },
    { type: 'wokwi-ir-receiver', label: 'IR Receiver' },
    { type: 'wokwi-ir-remote', label: 'IR Remote' },
    { type: 'wokwi-relay-module', label: 'KS2E-M-DC5' },
    { type: 'wokwi-ky-040', label: 'KY040' },
    { type: 'wokwi-lcd1602', label: 'LCD1602', attrs: { pins: 'i2c' } },
    { type: 'wokwi-lcd2004', label: 'LCD2004', attrs: { pins: 'i2c' } },
    { type: 'wokwi-led-bar-graph', label: 'Led Bar Graph' },
    { type: 'wokwi-led', label: 'LED', attrs: { color: 'red' } },
    { type: 'wokwi-led-ring', label: 'LED Ring', attrs: { pixels: '16' } },
    { type: 'wokwi-membrane-keypad', label: 'Membrane Keypad' },
    { type: 'wokwi-microsd-card', label: 'microSD Card' },
    { type: 'wokwi-mpu6050', label: 'MPU6050' },
    { type: 'wokwi-nano-rp2040-connect', label: 'Nano RP2040 Connect' },
    { type: 'wokwi-neopixel', label: 'Neopixel' },
    { type: 'wokwi-neopixel-matrix', label: 'NeoPixel Matrix' },
    { type: 'wokwi-ntc-temperature-sensor', label: 'NTC Temperature Sensor' },
    { type: 'wokwi-photoresistor-sensor', label: 'Photoresistor Sensor' },
    { type: 'wokwi-pir-motion-sensor', label: 'PIR Motion Sensor' },
    { type: 'wokwi-potentiometer', label: 'Potentiometer' },
    { type: 'wokwi-pushbutton-6mm', label: 'Pushbutton 6mm', attrs: { color: 'green' } },
    { type: 'wokwi-pushbutton', label: 'Pushbutton', attrs: { color: 'green' } },
    { type: 'wokwi-resistor', label: 'Resistor', attrs: { value: '1000' } },
    { type: 'wokwi-rgb-led', label: 'RGB Led' },
    { type: 'wokwi-rotary-dialer', label: 'Rotary Dialer' },
    { type: 'wokwi-servo', label: 'Servo' },
    { type: 'wokwi-slide-potentiometer', label: 'Slide Potentiometer' },
    { type: 'wokwi-slide-switch', label: 'Slide Switch' },
    { type: 'wokwi-small-sound-sensor', label: 'Small Sound Sensor' },
    { type: 'wokwi-ssd1306', label: 'SSD1306' },
    { type: 'wokwi-stepper-motor', label: 'Stepper Motor' },
    { type: 'wokwi-tilt-switch', label: 'Tilt Switch' },
    // ── Special / Meta ──
    { type: 'wokwi-label', label: 'Text Label', attrs: { text: 'Label', color: '#ffffff', 'font-size': '14' } },
];

/** Wire color palette for the toolbar */
export const WIRE_COLORS = ['green', 'red', 'blue', 'black', 'orange', 'purple'] as const;
