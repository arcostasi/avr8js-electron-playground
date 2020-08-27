import { IpcService } from "./ipc-service";

const ipc = new IpcService();

document.getElementById('request-os-info').addEventListener('click', async () => {
  const t = await ipc.send<{ kernel: string }>('system-info');
  document.getElementById('status-label').innerHTML = t.kernel;
});
