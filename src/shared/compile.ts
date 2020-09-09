/**
 * Build Hex
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
const url = 'https://hexi.wokwi.com';

export interface IHexiResult {
  stdout: string;
  stderr: string;
  hex: string;
}

export async function buildHex(source: string, files: any[] = []) {
  const resp = await fetch(url + '/build', {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sketch: source, files })
  });

  return (await resp.json()) as IHexiResult;
}
