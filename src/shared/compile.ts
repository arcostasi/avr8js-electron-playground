/**
 * Build Hex
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
const url = 'https://hexi.wokwi.com';
// const url = 'http://localhost';

export interface IHexiResult {
  stdout: string;
  stderr: string;
  hex: string;
}

/**
 * @param source - main source
 * @param files - array[]
 * @param board - 'nano', 'uno', 'mega'
 */
export async function buildHex(source: string, files: any[] = [], board: string = 'uno') {
  const resp = await fetch(url + '/build', {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sketch: source, files, board: board })
  });

  return (await resp.json()) as IHexiResult;
}
