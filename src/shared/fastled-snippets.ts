/**
 * FastLED Snippets for Monaco Editor
 *
 * Copyright (C) 2021, Elliott Kember & Uri Shaked
 */

import type { languages } from 'monaco-editor';
import { cssColorValue } from './fastled-colors';
import { colorConstants, constants, methods } from './fastled-keywords';
import { MonacoGlobal } from './types';

/* eslint-disable no-template-curly-in-string */
export function fastledSnippets(monaco: MonacoGlobal): languages.CompletionItem[] {
  // Some of these come from https://github.com/FastLED/FastLED/blob/d5ddf40d3f3731adb36c122abba29cbf80654be3/src/colorutils.h
  const insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  const kind = monaco.languages.CompletionItemKind.Function;
  return [
    {
      label: 'XY(x, y) - takes X and Y, and returns index',
      kind,
      insertText: 'XY(${1:uint8_t x}, ${2:uint8_t x})',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'CRGB(red, green, blue)',
      kind,
      insertText: 'CRGB(${1:red}, ${2:green}, ${3:blue})',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'CHSV(hue, saturation, brightness)',
      kind,
      insertText: 'CHSV(${1:hue}, ${2:saturation}, ${3:brightness})',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'fadeToBlackBy(CRGB* leds, int NUM_LEDS, int fade);',
      documentation:
        'reduce the brightness of an array of pixels all at once.  These functions will eventually fade all the way to black.',
      kind,
      insertText: 'fadeToBlackBy(${1:leds}, ${2:NUM_LEDS}, ${3:64});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'fadeLightBy(CRGB* leds, int NUM_LEDS, int fade);',
      documentation:
        'Reduce the brightness of an array of pixels all at once.  Guaranteed to never fade all the way to black.',
      kind,
      insertText: 'fadeToBlackBy(${1:leds}, ${2:NUM_LEDS}, ${3:64});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'leds[index]',
      documentation: 'The array of LEDs',
      kind,
      insertText: 'leds[${1:0}]',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'NUM_LEDS',
      documentation: 'The number of LEDs in your Soulmate',
      kind,
      insertText: 'NUM_LEDS',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'COLS',
      documentation: 'The number of columns in your LED matrix',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'COLS',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'ROWS',
      documentation: 'The number of ropws in your LED matrix',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'COLS',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'for-loop: x/y',
      documentation: 'Loop over all your LEDs',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `for (int x = 0; x < COLS; x++) {
  for (int y = 0; y < ROWS; y++) {
    int index = XY(x, y);
    leds[index] = \${1:CRGB(255, 0, 0)};
  }
}`,
      insertTextRules,
      range: null as any,
    },
    {
      label: 'for-loop: index',
      documentation: 'Loop over all your LEDs',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `for (int i = 0; i < N_LEDS; i++) {
  leds[i] = \${1:CRGB(255, 0, 0)};
}`,
      insertTextRules,
      range: null as any,
    },
    {
      label: 'beatsin8 - 8-bit sine-wave function',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'beatsin8(${1:int bpm}, ${2:int minimum}, ${3:int maximum});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'beatsin16 - 16-bit sine-wave function',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'beatsin16(${1:int bpm}, ${2:uint16_t minimum}, ${3:uint16_t maximum});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'random16() - 16-bit random function',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'random16(${1:uint16_t maximum});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'blur1d(CRGB* leds, uint16_t numLeds, fract8 blur_amount);',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'blur1d(leds, ${1:NUM_LEDS}, ${2:64});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'blur2d(CRGB* leds, uint8_t width, uint8_t height, fract8 blur_amount);',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'blur2d(leds, ${1:LED_COLS}, ${2:LED_ROWS}, ${3:64});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'blurRows(CRGB* leds, uint8_t width, uint8_t height, fract8 blur_amount);',
      documentation: 'perform a blur1d on every row of a rectangular matrix',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'blurRows(leds, ${1:LED_COLS}, ${2:LED_ROWS}, ${3:64});',
      insertTextRules,
      range: null as any,
    },
    {
      label: 'blurColumns(CRGB* leds, uint8_t width, uint8_t height, fract8 blur_amount);',
      documentation: 'perform a blur1d on each column of a rectangular matrix',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'blurColumns(leds, ${1:LED_COLS}, ${2:LED_ROWS}, ${3:64});',
      insertTextRules,
      range: null as any,
    },
    ...constants.map((constants) => ({
      label: constants,
      kind: monaco.languages.CompletionItemKind.Constant,
      insertText: constants,
      insertTextRules,
      range: null as any,
    })),
    ...colorConstants.map((colorName) => ({
      label: colorName,
      kind: monaco.languages.CompletionItemKind.Color,
      insertText: colorName,
      insertTextRules,
      documentation: cssColorValue(colorName),
      range: null as any,
    })),
    ...methods.map((method) => ({
      label: method,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: method,
      insertTextRules,
      range: null as any,
    })),
    ...['FastLED', 'LEDS'].map((item) => ({
      label: item,
      kind: monaco.languages.CompletionItemKind.Text,
      insertText: item,
      detail: 'FastLED library methods',
      range: null as any,
    })),
  ];
}
