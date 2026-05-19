import type { I2CDevice } from '../../shared/i2c-bus';
import type { CanBridgeFrame } from '../../shared/can-bridge';
import type { RuntimeAbiContext, RuntimeImportModule } from './custom-chip-runtime-compat';

function readCanFrame(context: RuntimeAbiContext, framePtr: number): CanBridgeFrame {
    const data: number[] = [];
    for (let index = 0; index < 8; index++) {
        data.push(context.readU8(framePtr + 16 + index));
    }
    return {
        id: context.readU32(framePtr),
        dlc: context.readU32(framePtr + 4),
        flags: context.readU32(framePtr + 8),
        timestamp: context.readU32(framePtr + 12),
        data,
    };
}

function writeCanFrame(context: RuntimeAbiContext, framePtr: number, frame: CanBridgeFrame): void {
    context.writeU32(framePtr, frame.id >>> 0);
    context.writeU32(framePtr + 4, frame.dlc >>> 0);
    context.writeU32(framePtr + 8, frame.flags >>> 0);
    context.writeU32(framePtr + 12, frame.timestamp >>> 0);
    for (let index = 0; index < 8; index++) {
        context.writeU8(framePtr + 16 + index, frame.data[index] ?? 0);
    }
}

export function installPeripheralRuntimeAbi(
    importName: string,
    mod: RuntimeImportModule,
    context: RuntimeAbiContext,
): boolean {
    switch (importName) {
        case 'i2c_init':
            mod[importName] = (configPtr: number) => {
                const address = context.readU32(configPtr) & 0x7F;
                const connect = context.readU32(configPtr + 12);
                const read = context.readU32(configPtr + 16);
                const write = context.readU32(configPtr + 20);
                const disconnect = context.readU32(configPtr + 24);
                const userData = context.readU32(configPtr + 28);

                if (address !== 0 && context.i2cBus.devices[address]) {
                    context.onChipLog?.(`[chip:${context.bridge.chipName}] i2c_init address 0x${address.toString(16)} already in use.\n`);
                    return 0;
                }

                const devId = context.state.nextI2CDevId++;
                const device: I2CDevice = {
                    i2cConnect: (addr, rw) => connect
                        ? Number(context.callIndirect(connect, [userData, addr, rw])) !== 0
                        : true,
                    i2cReadByte: (acked) => read
                        ? (Number(context.callIndirect(read, [userData, acked])) & 0xFF)
                        : 0xFF,
                    i2cWriteByte: (value) => write
                        ? Number(context.callIndirect(write, [userData, value & 0xFF])) !== 0
                        : true,
                    i2cDisconnect: () => {
                        if (disconnect) context.callIndirect(disconnect, [userData]);
                    },
                };

                if (address === 0) {
                    context.i2cBus.registerWildcardDevice(device);
                } else {
                    context.i2cBus.registerDevice(address, device);
                }
                return devId;
            };
            return true;

        case 'uart_init':
            mod[importName] = (configPtr: number) => {
                const id = context.state.nextUartId++;
                const rxPin = context.readU32(configPtr);
                const txPin = context.readU32(configPtr + 4);
                const rxData = context.readU32(configPtr + 12);
                context.state.uartState.set(id, {
                    writeDone: context.readU32(configPtr + 16),
                    rxData,
                    userData: context.readU32(configPtr + 20),
                    busy: false,
                    rxPin,
                    txPin,
                    linkedToUsart: false,
                });

                const uart = context.state.uartState.get(id);
                if (!uart) return id;

                const rxMap = context.bridge.pinBridge[rxPin];
                const connectedToMcuTx = rxMap?.arduinoPin === '1';
                if (rxData && connectedToMcuTx) {
                    context.subscribeUsartByteSink(`${context.state.chipRuntimeId}:uart:${id}`, (value: number) => {
                        context.callIndirect(uart.rxData, [uart.userData, value & 0xFF]);
                    });
                    uart.linkedToUsart = true;
                }
                return id;
            };
            return true;

        case 'uart_write':
            mod[importName] = (uartId: number, bufferPtr: number, count: number) => {
                const uart = context.state.uartState.get(uartId);
                if (!uart || uart.busy) return 0;
                uart.busy = true;

                const bytes: number[] = [];
                for (let index = 0; index < count; index++) {
                    bytes.push(context.readU8(bufferPtr + index));
                }

                const txMap = context.bridge.pinBridge[uart.txPin];
                const connectedToMcuRx = txMap?.arduinoPin === '0';
                if (connectedToMcuRx && bytes.length > 0) {
                    const text = String.fromCodePoint(...bytes.map((value) => value & 0xFF));
                    context.runner.serialWrite(text);
                }

                context.onChipLog?.(`[chip:${context.bridge.chipName}] uart_write(${count} byte(s)): ${bytes.map((value) => value.toString(16).padStart(2, '0')).join(' ')}\n`);
                queueMicrotask(() => {
                    uart.busy = false;
                    if (uart.writeDone) {
                        context.callIndirect(uart.writeDone, [uart.userData]);
                    }
                });
                return 1;
            };
            return true;

        case 'spi_init':
            mod[importName] = (configPtr: number) => {
                const devId = context.state.nextSpiId++;
                context.state.spiState.set(devId, {
                    done: context.readU32(configPtr + 16),
                    userData: context.readU32(configPtr + 20),
                });
                context.ensureSpiHook();
                return devId;
            };
            return true;

        case 'spi_start':
            mod[importName] = (devId: number, bufferPtr: number, count: number) => {
                if (!context.state.spiState.has(devId)) return;
                context.state.spiActive = {
                    devId,
                    bufferPtr,
                    count: Math.max(0, Math.trunc(count)),
                    transferred: 0,
                };
            };
            return true;

        case 'spi_stop':
            mod[importName] = (devId: number) => {
                if (context.state.spiActive?.devId !== devId) return;
                const done = context.state.spiState.get(devId)?.done ?? 0;
                const user = context.state.spiState.get(devId)?.userData ?? 0;
                const bufferPtr = context.state.spiActive.bufferPtr;
                const transferred = context.state.spiActive.transferred;
                context.state.spiActive = null;
                if (done) {
                    context.callIndirect(done, [user, bufferPtr, transferred]);
                }
            };
            return true;

        case 'can_bridge_open':
            mod[importName] = (configPtr: number) => context.startCanBridge({
                channelIndex: Math.max(0, Math.trunc(context.readU32(configPtr))),
                bitrate: Math.trunc(context.readU32(configPtr + 4)) || 500000,
                acceptVirtual: context.readU32(configPtr + 8) !== 0,
                ledCommandId: Math.trunc(context.readU32(configPtr + 12)) || 0x200,
                autoLedIntervalMs: Math.max(0, Math.trunc(context.readU32(configPtr + 16))),
            });
            return true;

        case 'can_bridge_close':
            mod[importName] = (bridgeId: number) => {
                context.stopCanBridge(bridgeId);
            };
            return true;

        case 'can_bridge_ready':
            mod[importName] = (bridgeId: number) => context.canBridgeReady(bridgeId) ? 1 : 0;
            return true;

        case 'can_bridge_send':
            mod[importName] = (bridgeId: number, framePtr: number) => context.sendCanFrame(bridgeId, readCanFrame(context, framePtr)) ? 1 : 0;
            return true;

        case 'can_bridge_receive':
            mod[importName] = (bridgeId: number, framePtr: number) => {
                const frame = context.pollCanFrame(bridgeId);
                if (!frame) return 0;
                writeCanFrame(context, framePtr, frame);
                return 1;
            };
            return true;

        default:
            return false;
    }
}