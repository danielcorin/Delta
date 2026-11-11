import { app, ipcMain as electronIPC, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function trustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  const url = event.senderFrame.url;
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && !app.isPackaged) return new URL(url).origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
  return url === pathToFileURL(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).href;
}
export const ipcMain = {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
    electronIPC.handle(channel, (event, ...args) => {
      if (!trustedSender(event)) throw new Error("Untrusted request.");
      return listener(event, ...args);
    });
  },
  on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
    electronIPC.on(channel, (event, ...args) => { if (trustedSender(event)) listener(event, ...args); });
  },
};
