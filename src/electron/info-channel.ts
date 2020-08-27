import { IpcChannelInterface } from "./ipc-channel";
import { IpcMainEvent } from 'electron';
import { IpcRequest } from "./ipc-request";
import { execSync } from "child_process";

export class SystemInfoChannel implements IpcChannelInterface {

  getName(): string {
    return 'system-info';
  }

  handle(event: IpcMainEvent, request: IpcRequest): void {

    if (!request.responseChannel) {
      request.responseChannel = `${this.getName()}_response`;
    }

    event.sender.send(request.responseChannel, {
      kernel: execSync('ver').toString()
    });
  }
}
