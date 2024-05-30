#! /usr/bin/env node
import os from "os";
import network from "network";
import child_process from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import meow from "meow";
import {
  startDownloadServer,
  startUploadServer,
  sendMessage,
} from "./index.js";

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  console.log("network is unreachable");
  process.exit(1);
};

function getLocalIpsAvailable(cb) {
  network.get_interfaces_list((err, interfaces) => {
    if (err) {
      cb(err, null);
      return;
    }
    const data = interfaces
      .filter((iface) => !iface.internal)
      .map((iface) => iface.ip_address)
      .filter((ip) => ip);
    cb(null, data);
  });
}

const getSSID = () => {
  const WINDOWS = "win32",
    MACOS = "darwin",
    LINUX = "linux";
  const os = process.platform;
  try {
    if (os === LINUX) {
      const ssid = child_process
        .execSync("iwgetid -r 2>/dev/null")
        .toString()
        .trim();
      return ssid;
    } else if (os === MACOS) {
      const ssid = child_process
        .execSync(
          "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | awk '/ SSID/ {print substr($0, index($0, $2))}'",
        )
        .toString()
        .trim();
      return ssid;
    } else if (os === WINDOWS) {
      let interface_info = child_process
        .execSync("netsh.exe wlan show interfaces")
        .toString();
      for (let line of interface_info.split("\n")) {
        if (line.trim().startsWith("Profile")) {
          const ssid = line.split(":")[1].trim();
          return ssid;
        }
      }
    }
    return null;
  } catch (err) {
    console.log(`err finding ssid: ${err} ${os}`);
  }
};

//choose a port from this range to avoid conflicts with well-known ports.
const getRandomPort = (max = 65535, min = 1024) => {
  return Math.floor(Math.random() * (max - min) + min);
};

const findAvaliablePort = () => {
  return new Promise((resolve, reject) => {
    const port = getRandomPort();
    const server = http.createServer();
    server.listen(port, () => {
      server.on("close", () => {
        resolve(port);
      });
      server.close();
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`${port} already in use, searching for another one\n`);
        findAvaliablePort().then(resolve).catch(reject);
      } else {
        reject("error finding port");
      }
    });
  });
};

const main = async () => {
  let port, address, filePath, mode, debug, cli, message;
  const helpText = `
		qrxfr - cli tool to share files btw devices in same network by scanning a qr
		${chalk.bold("Usage:")} 
    ${chalk.italic("- message passing:")} qrxfr [--message MESSAGE]
      $ qrxfr --message,-m MESSAGE

    ${chalk.italic("- file sharing: ")} qrxfr [option {value}] <path>
      $ qrxfr /path/to/file || /path/to/folder
      $ qrxfr --recieve,-r /path/to/receive/file/to
      $ qrxfr --port,-p PORT
      $ qrxfr --ip,-i IP_ADDRESS
      $ qrxfr --help
      $ qrxfr --version

		${chalk.bold("Options:")}
      -r --receive \tenable upload mode, given path's used to store recieved file, defaults to pwd
      -p --port    \tuse a custom port for server; note: 1024<=PORT<=65535 to avoid conflicting errors
      -i --ip      \tbind webserver to custom ip, must be accessible from within subnetwork 
      -m --message \tsend message to client
      -h --help    \tshow this screen
      -v --version \tshow version

		${chalk.bold("Examples:")}
      $ qrxfr ./assignment.pdf
      $ qrxfr one.txt -p 4000 --ip 192.168.1.10
      $ qrxfr sampleFolder
      $ qrxfr --receive ./Downloads
      $ qrxfr -r
      $ qrxfr -r ./Downloads -p 5000 -i 192.168.200.23
      $ qrxfr -m "Kaizoku ou ni ore wa naru"
      $ qrxfr --message "messaging..." -p 4000 -i 192.168.12.24
	`;
  getLocalIpsAvailable(async (err, ips) => {
    if (err) {
    } else {
      cli = meow({
        importMeta: import.meta,
        help: helpText,
        flags: {
          ip: {
            type: "string",
            default: getLocalIp(),
            choices: ips,
            shortFlag: "i",
            aliases: ["IP", "iP"],
            isMultiple: false,
          },
          port: {
            type: "number",
            default: 1023,
            shortFlag: "p",
            aliases: ["Port", "PORT"],
            isMultiple: false,
          },
          message: {
            type: "boolean",
            default: false,
            shortFlag: "m",
            aliases: ["msg"],
            isMultiple: false,
          },
          help: {
            type: "boolean",
            default: false,
            shortFlag: "h",
          },
          version: {
            type: "boolean",
            default: false,
            shortFlag: "v",
          },
          receive: {
            type: "boolean",
            default: false,
            shortFlag: "r",
          },
        },
        description: false,
      });
      debug = true;
      mode = cli.flags.r || cli.flags.receive;
      port = cli.flags.port || cli.flags.p || cli.flags.Port || cli.flags.PORT;
      address = cli.flags.ip || cli.flags.i || cli.flags.IP || cli.flags.iP;
      message = cli.flags.message || cli.flags.m || cli.flags.msg;
      filePath = cli.input[0];
      const msg = cli.input?.join(" ");
      if (!message) {
        if (!filePath && mode) {
          filePath = ".";
        }
        if (!fs.existsSync(filePath)) {
          console.log(chalk.red.bold(`No such file or directory ${filePath}`));
          if (!mode)
            console.log(chalk.red.bold(`specify a valid file to send`));
          if (mode)
            console.log(chalk.red.bold(`specify a folder to receive to`));
          console.log(chalk.red(`see qrxfr --help for more info`));
          process.exit(1);
        }
        const stats = fs.statSync(path.normalize(path.resolve(filePath)));
        if (mode && !stats.isDirectory()) {
          console.log(chalk.red.bold(`${filePath} is not a folder`));
          console.log(chalk.red(`see qrxfr --help for more info`));
          process.exit(1);
        }
        if (
          mode &&
          path.basename(path.normalize(path.resolve(filePath))) == "public"
        ) {
          console.log(chalk.red.bold(`cannot choose public folder to receive`));
          process.exit(1);
        }
      }
      if (message && !msg) {
        console.log(chalk.red.bold(`enter valid message to send`));
        console.log(chalk.red(`see qrxfr --help for more info`));
        process.exit(1);
      }
      if (!port || port < 1024) {
        try {
          port = await findAvaliablePort();
        } catch (err) {
          console.log(`failed to find available port, try again later ${err}`);
          process.exit(1);
        }
      }
      if (!address) {
        address = getLocalIp();
      }
      const ssid = getSSID();
      console.log(
        `make sure your device is connected to ${chalk.blue.bold(ssid)}`,
      );
      if (message) {
        sendMessage({ port, address, debug, msg });
      } else if (mode) {
        startUploadServer({ filePath, port, address, debug, mode: mode });
      } else
        startDownloadServer({ filePath, port, address, debug, mode: null });
    }
  });
};
main();
