/**
 * Build Hex
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
const DEFAULT_URL = 'https://hexi.wokwi.com';

export interface IHexiResult {
  stdout: string;
  stderr: string;
  hex: string;
}

/**
 * @param source - main source
 * @param files - array[]
 * @param board - 'nano', 'uno', 'mega'
 * @param options - extra options
 * @param debug - use local debug server
 * @param baseUrl - override the Hexi cloud URL (reads from settings when omitted)
 */
export async function buildHex(
  source: string,
  files: { name: string, content: string }[],
  board: string = 'uno',
  options: Record<string, unknown> = {},
  debug: boolean = false,
  baseUrl?: string,
) {
  // Check FakeRamSize test
  if (!debug && board === 'fakeuno') {
    board = 'uno';
  }

  const _url = debug ? 'http://localhost:9090' : (baseUrl || DEFAULT_URL);

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
