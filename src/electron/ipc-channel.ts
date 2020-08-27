import { IpcMainEvent } from 'electron';
import { IpcRequest } from './ipc-request';

export interface IpcChannelInterface {
  getName(): string;

  handle(event: IpcMainEvent, request: IpcRequest): void;
}
