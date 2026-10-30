import os from "node:os";
import path from "node:path";

export interface AppPaths {
  home: string;
  tasks: string;
  locks: string;
}

export function getAppPaths(): AppPaths {
  const defaultHome = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA ?? os.homedir(), "chatgpt-image")
    : path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "chatgpt-image");
  const home = path.resolve(process.env.CHATGPT_IMAGE_HOME ?? defaultHome);
  return {
    home,
    tasks: path.join(home, "tasks"),
    locks: path.join(home, "locks"),
  };
}
