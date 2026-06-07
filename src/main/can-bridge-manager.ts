import type { IpcMain, IpcMainEvent, WebContents } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type { CanBridgeEvent, CanBridgeFrame, CanBridgeStartOptions } from '../shared/can-bridge';

interface CanBridgeSession {
  sender: WebContents;
  proc: ChildProcessWithoutNullStreams;
  sessionId: string;
}

let canBridgeIpcRegistered = false;

function sanitizeFrame(frame: CanBridgeFrame): CanBridgeFrame {
  const dlc = Math.max(0, Math.min(8, Math.trunc(frame.dlc)));
  const data = Array.from({ length: 8 }, (_, index) => Math.max(0, Math.min(255, Math.trunc(frame.data[index] ?? 0))));
  return {
    id: Math.max(0, Math.trunc(frame.id)),
    dlc,
    flags: Math.max(0, Math.trunc(frame.flags)),
    timestamp: Math.max(0, Math.trunc(frame.timestamp ?? 0)),
    data,
  };
}

function emitSessionEvent(sender: WebContents, sessionId: string, event: CanBridgeEvent): void {
  if (sender.isDestroyed()) {
    return;
  }
  sender.send('can-bridge:event', { sessionId, event });
}

function parseFrameTokens(tokens: string[]): CanBridgeFrame | null {
  if (tokens.length < 12) {
    return null;
  }
  const [idToken, dlcToken, flagsToken, timestampToken, ...dataTokens] = tokens;
  const id = Number.parseInt(idToken ?? '', 10);
  const dlc = Number.parseInt(dlcToken ?? '', 10);
  const flags = Number.parseInt(flagsToken ?? '', 10);
  const timestamp = Number.parseInt(timestampToken ?? '', 10);
  const data = dataTokens.slice(0, 8).map((token) => Number.parseInt(token, 10));
  if ([id, dlc, flags, timestamp, ...data].some((value) => Number.isNaN(value))) {
    return null;
  }
  return sanitizeFrame({ id, dlc, flags, timestamp, data });
}

function parseHelperLine(line: string): CanBridgeEvent {
  if (line === 'READY' || line.startsWith('READY ')) {
    return { type: 'ready', message: line };
  }
  if (line.startsWith('LOG ')) {
    return { type: 'log', message: line.slice(4) };
  }
  if (line.startsWith('ERROR ')) {
    return { type: 'error', message: line.slice(6) };
  }
  if (line.startsWith('CLOSED')) {
    return { type: 'closed', message: line };
  }
  if (line.startsWith('RX ')) {
    const frame = parseFrameTokens(line.slice(3).trim().split(/\s+/));
    return frame
      ? { type: 'rx', frame }
      : { type: 'error', message: `Invalid RX frame from helper: ${line}` };
  }
  if (line.startsWith('TX ')) {
    const frame = parseFrameTokens(line.slice(3).trim().split(/\s+/));
    return frame
      ? { type: 'tx', frame }
      : { type: 'error', message: `Invalid TX frame from helper: ${line}` };
  }
  return { type: 'log', message: line };
}

export function registerCanBridgeIpc(ipcMain: IpcMain, appRoot: string): void {
  if (canBridgeIpcRegistered) {
    return;
  }
  canBridgeIpcRegistered = true;

  const sessions = new Map<string, CanBridgeSession>();

  const helperPath = path.join(appRoot, 'tools', 'canlib-bridge', 'bin', 'canbridge-kvaser.exe');
  const dllDir = path.join(appRoot, 'lib', 'kvaser-canlib', 'x64');

  const stopSession = (sessionId: string, reason = 'stopped'): void => {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }
    sessions.delete(sessionId);

    try {
      session.proc.stdin.write('STOP\n');
    } catch {
      // ignore broken pipes during shutdown
    }
    if (!session.proc.killed) {
      session.proc.kill();
    }
    emitSessionEvent(session.sender, sessionId, { type: 'closed', message: reason });
  };

  ipcMain.on('can-bridge:start', (event: IpcMainEvent, options: CanBridgeStartOptions) => {
    if (!options?.sessionId) {
      return;
    }
    stopSession(options.sessionId, 'restarting');

    if (!fs.existsSync(helperPath)) {
      emitSessionEvent(event.sender, options.sessionId, {
        type: 'error',
        message: `CAN helper not found at ${helperPath}. Build tools/canlib-bridge first.`,
      });
      return;
    }

    const args = [
      '--channel', String(options.channelIndex),
      '--bitrate', String(options.bitrate),
      '--auto-led-ms', String(options.autoLedIntervalMs),
      '--led-command-id', String(options.ledCommandId),
    ];
    if (options.acceptVirtual) {
      args.push('--accept-virtual');
    }

    const proc = spawn(helperPath, args, {
      cwd: path.dirname(helperPath),
      env: {
        ...process.env,
        PATH: `${dllDir};${process.env.PATH ?? ''}`,
      },
      stdio: 'pipe',
    });

    const session: CanBridgeSession = {
      sender: event.sender,
      proc,
      sessionId: options.sessionId,
    };
    sessions.set(options.sessionId, session);

    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      emitSessionEvent(event.sender, options.sessionId, parseHelperLine(line.trim()));
    });

    readline.createInterface({ input: proc.stderr }).on('line', (line) => {
      emitSessionEvent(event.sender, options.sessionId, { type: 'log', message: line.trim() });
    });

    proc.on('error', (error) => {
      emitSessionEvent(event.sender, options.sessionId, { type: 'error', message: error.message });
    });

    proc.on('close', (code, signal) => {
      sessions.delete(options.sessionId);
      emitSessionEvent(event.sender, options.sessionId, {
        type: 'closed',
        message: `helper exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      });
    });
  });

  ipcMain.on('can-bridge:send', (_event: IpcMainEvent, payload: { sessionId: string; frame: CanBridgeFrame }) => {
    const session = sessions.get(payload?.sessionId ?? '');
    if (!session) {
      return;
    }
    const frame = sanitizeFrame(payload.frame);
    const parts = [
      'SEND',
      String(frame.id),
      String(frame.dlc),
      String(frame.flags),
      ...frame.data.map((value) => String(value)),
    ];
    try {
      session.proc.stdin.write(`${parts.join(' ')}\n`);
    } catch {
      emitSessionEvent(session.sender, session.sessionId, {
        type: 'error',
        message: 'Failed to write SEND command to CAN helper.',
      });
    }
  });

  ipcMain.on('can-bridge:stop', (_event: IpcMainEvent, payload: { sessionId: string }) => {
    if (!payload?.sessionId) {
      return;
    }
    stopSession(payload.sessionId);
  });

  ipcMain.on('window-close', () => {
    for (const sessionId of Array.from(sessions.keys())) {
      stopSession(sessionId, 'window closing');
    }
  });
}
