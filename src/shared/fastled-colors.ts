/**
 * FastLED Color Provider for Monaco Editor
 *
 * Copyright (C) 2021, Elliott Kember & Uri Shaked
 */

import type { IRange, Position, languages, editor } from 'monaco-editor';

export const fastledColors: { [key: string]: number | undefined } = {
  AliceBlue: 0xf0f8ff,
  Amethyst: 0x9966cc,
  AntiqueWhite: 0xfaebd7,
  Aqua: 0x00ffff,
  Aquamarine: 0x7fffd4,
  Azure: 0xf0ffff,
  Beige: 0xf5f5dc,
  Bisque: 0xffe4c4,
  Black: 0x000000,
  BlanchedAlmond: 0xffebcd,
  Blue: 0x0000ff,
  BlueViolet: 0x8a2be2,
  Brown: 0xa52a2a,
  BurlyWood: 0xdeb887,
  CadetBlue: 0x5f9ea0,
  Chartreuse: 0x7fff00,
  Chocolate: 0xd2691e,
  Coral: 0xff7f50,
  CornflowerBlue: 0x6495ed,
  Cornsilk: 0xfff8dc,
  Crimson: 0xdc143c,
  Cyan: 0x00ffff,
  DarkBlue: 0x00008b,
  DarkCyan: 0x008b8b,
  DarkGoldenrod: 0xb8860b,
  DarkGray: 0xa9a9a9,
  DarkGrey: 0xa9a9a9,
  DarkGreen: 0x006400,
  DarkKhaki: 0xbdb76b,
  DarkMagenta: 0x8b008b,
  DarkOliveGreen: 0x556b2f,
  DarkOrange: 0xff8c00,
  DarkOrchid: 0x9932cc,
  DarkRed: 0x8b0000,
  DarkSalmon: 0xe9967a,
  DarkSeaGreen: 0x8fbc8f,
  DarkSlateBlue: 0x483d8b,
  DarkSlateGray: 0x2f4f4f,
  DarkSlateGrey: 0x2f4f4f,
  DarkTurquoise: 0x00ced1,
  DarkViolet: 0x9400d3,
  DeepPink: 0xff1493,
  DeepSkyBlue: 0x00bfff,
  DimGray: 0x696969,
  DimGrey: 0x696969,
  DodgerBlue: 0x1e90ff,
  FireBrick: 0xb22222,
  FloralWhite: 0xfffaf0,
  ForestGreen: 0x228b22,
  Fuchsia: 0xff00ff,
  Gainsboro: 0xdcdcdc,
  GhostWhite: 0xf8f8ff,
  Gold: 0xffd700,
  Goldenrod: 0xdaa520,
  Gray: 0x808080,
  Grey: 0x808080,
  Green: 0x008000,
  GreenYellow: 0xadff2f,
  Honeydew: 0xf0fff0,
  HotPink: 0xff69b4,
  IndianRed: 0xcd5c5c,
  Indigo: 0x4b0082,
  Ivory: 0xfffff0,
  Khaki: 0xf0e68c,
  Lavender: 0xe6e6fa,
  LavenderBlush: 0xfff0f5,
  LawnGreen: 0x7cfc00,
  LemonChiffon: 0xfffacd,
  LightBlue: 0xadd8e6,
  LightCoral: 0xf08080,
  LightCyan: 0xe0ffff,
  LightGoldenrodYellow: 0xfafad2,
  LightGreen: 0x90ee90,
  LightGrey: 0xd3d3d3,
  LightPink: 0xffb6c1,
  LightSalmon: 0xffa07a,
  LightSeaGreen: 0x20b2aa,
  LightSkyBlue: 0x87cefa,
  LightSlateGray: 0x778899,
  LightSlateGrey: 0x778899,
  LightSteelBlue: 0xb0c4de,
  LightYellow: 0xffffe0,
  Lime: 0x00ff00,
  LimeGreen: 0x32cd32,
  Linen: 0xfaf0e6,
  Magenta: 0xff00ff,
  Maroon: 0x800000,
  MediumAquamarine: 0x66cdaa,
  MediumBlue: 0x0000cd,
  MediumOrchid: 0xba55d3,
  MediumPurple: 0x9370db,
  MediumSeaGreen: 0x3cb371,
  MediumSlateBlue: 0x7b68ee,
  MediumSpringGreen: 0x00fa9a,
  MediumTurquoise: 0x48d1cc,
  MediumVioletRed: 0xc71585,
  MidnightBlue: 0x191970,
  MintCream: 0xf5fffa,
  MistyRose: 0xffe4e1,
  Moccasin: 0xffe4b5,
  NavajoWhite: 0xffdead,
  Navy: 0x000080,
  OldLace: 0xfdf5e6,
  Olive: 0x808000,
  OliveDrab: 0x6b8e23,
  Orange: 0xffa500,
  OrangeRed: 0xff4500,
  Orchid: 0xda70d6,
  PaleGoldenrod: 0xeee8aa,
  PaleGreen: 0x98fb98,
  PaleTurquoise: 0xafeeee,
  PaleVioletRed: 0xdb7093,
  PapayaWhip: 0xffefd5,
  PeachPuff: 0xffdab9,
  Peru: 0xcd853f,
  Pink: 0xffc0cb,
  Plaid: 0xcc5533,
  Plum: 0xdda0dd,
  PowderBlue: 0xb0e0e6,
  Purple: 0x800080,
  Red: 0xff0000,
  RosyBrown: 0xbc8f8f,
  RoyalBlue: 0x4169e1,
  SaddleBrown: 0x8b4513,
  Salmon: 0xfa8072,
  SandyBrown: 0xf4a460,
  SeaGreen: 0x2e8b57,
  Seashell: 0xfff5ee,
  Sienna: 0xa0522d,
  Silver: 0xc0c0c0,
  SkyBlue: 0x87ceeb,
  SlateBlue: 0x6a5acd,
  SlateGray: 0x708090,
  SlateGrey: 0x708090,
  Snow: 0xfffafa,
  SpringGreen: 0x00ff7f,
  SteelBlue: 0x4682b4,
  Tan: 0xd2b48c,
  Teal: 0x008080,
  Thistle: 0xd8bfd8,
  Tomato: 0xff6347,
  Turquoise: 0x40e0d0,
  Violet: 0xee82ee,
  Wheat: 0xf5deb3,
  White: 0xffffff,
  WhiteSmoke: 0xf5f5f5,
  Yellow: 0xffff00,
  YellowGreen: 0x9acd32,
  // LED RGB color that roughly approximatesded).
  FairyLight: 0xffe42d,
  // If you are using no color correction, use this
  FairyLightNCC: 0xff9d2a,
};

export const CRGBRegexp = Object.keys(fastledColors)
  .map((colorName) => `CRGB::${colorName}`)
  .join('|');

function colorToMonaco(name: string) {
  const colorValue = fastledColors[name] || 0;
  return {
    red: ((colorValue >> 16) & 0xff) / 255,
    green: ((colorValue >> 8) & 0xff) / 255,
    blue: (colorValue & 0xff) / 255,
    alpha: 1,
  };
}

function rgbToMonaco(r: string, g: string, b: string) {
  return {
    red: parseInt(r) / 255,
    green: parseInt(g) / 255,
    blue: parseInt(b) / 255,
    alpha: 1,
  };
}

export function cssColorValue(name: string) {
  if (name.startsWith('CRGB::')) {
    name = name.substr(6);
  }
  const colorValue = fastledColors[name];
  if (colorValue != null) {
    const red = (colorValue >> 16) & 0xff;
    const green = (colorValue >> 8) & 0xff;
    const blue = colorValue & 0xff;
    return `rgb(${red}, ${green}, ${blue})`;
  } else {
    return '';
  }
}

function prevCharacter(pos: Position): IRange {
  const prevPos = pos.delta(0, -1);
  return {
    startLineNumber: prevPos.lineNumber,
    startColumn: prevPos.column,
    endLineNumber: pos.lineNumber,
    endColumn: pos.column,
  };
}

export function provideColorPresentations(colorInfo: languages.IColorInformation) {
  const red = Math.round(colorInfo.color.red * 255);
  const green = Math.round(colorInfo.color.green * 255);
  const blue = Math.round(colorInfo.color.blue * 255);
  const colorValue = (red << 16) + (green << 8) + blue;
  const suggestions = [];
  for (const colorName of Object.keys(fastledColors)) {
    if (fastledColors[colorName] === colorValue) {
      suggestions.push({ label: `CRGB::${colorName}` });
    }
  }
  return [
    ...suggestions,
    {
      label: `CRGB(${red}, ${green}, ${blue})`,
    },
  ];
}

export function provideDocumentColors(model: editor.ITextModel) {
  const crgbCallRegex = /CRGB\s*\(\s*(0x\d+|\d+)\s*,\s*(0x\d+|\d+)\s*,\s*(0x\d+|\d+)\s*\)/;
  const regexp = new RegExp(CRGBRegexp + '|' + crgbCallRegex.source, 'g');
  const matches = model.findMatches(regexp.source, true, true, false, null, true);
  const colorMarkers = [];
  for (const { range, matches: groups } of matches) {
    if (groups && model.getValueInRange(prevCharacter(range.getStartPosition())).match(/\W/)) {
      colorMarkers.push({
        color: groups[1]
          ? rgbToMonaco(groups[1], groups[2], groups[3])
          : colorToMonaco(groups[0].substr(6) || ''),
        range: range,
      });
    }
  }
  return colorMarkers;
}
