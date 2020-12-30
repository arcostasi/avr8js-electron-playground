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

/**
 * @param source - main source
 * @param files - array[]
 * @param board - 'nano', 'uno', 'mega'
 */
export async function buildHex(source: string, files: any,
  board: string = 'uno', options: any = {}, debug: boolean = false) {
  // Check FakeRamSize test
  if (!debug && (board = 'fakeuno')) {
    board = 'uno';
  }

  let _url = debug ? 'http://localhost:9090' : url;

  const resp = await fetch(_url + '/build', {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sketch: source,
      files,
      board: board,
      options: options
    })
  });

  if (!resp.ok) {
    const message = `An error has occured: ${resp.status}`;
    throw new Error(message);
  }

  return (await resp.json()) as IHexiResult;
}
