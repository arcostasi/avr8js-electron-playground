export interface CanBridgeFrame {
    id: number;
    dlc: number;
    flags: number;
    timestamp: number;
    data: number[];
}

export interface CanBridgeStartOptions {
    sessionId: string;
    channelIndex: number;
    bitrate: number;
    autoLedIntervalMs: number;
    ledCommandId: number;
    acceptVirtual: boolean;
}

export type CanBridgeEvent =
    | { type: 'ready'; message: string }
    | { type: 'log'; message: string }
    | { type: 'error'; message: string }
    | { type: 'closed'; message: string }
    | { type: 'rx'; frame: CanBridgeFrame }
    | { type: 'tx'; frame: CanBridgeFrame };
