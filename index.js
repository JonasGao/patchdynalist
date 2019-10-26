const asar = require("asar");
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");

async function exists(path) {
  return new Promise((res, rej) => {
    fs.stat(path, (err, s) => {
      if (err) {
        rej(err);
      } else {
        res(s);
      }
    });
  });
}

async function existsDir(path) {
  const s = await exists(path);
  if (!s.isDirectory()) {
    throw new Error("Not Dir!");
  }
}

async function removeDir(path) {
  return new Promise((res, rej) => {
    rimraf(path, err => {
      if (err) {
        rej(err);
      } else {
        res();
      }
    });
  });
}

async function readFile(path) {
  return new Promise((res, rej) => {
    fs.readFile(path, { encoding: "UTF-8" }, (err, data) => {
      if (err) {
        rej(err);
      } else {
        res(data);
      }
    });
  });
}

async function writeFile(path, data) {
  return new Promise((res, rej) => {
    fs.writeFile(path, data, err => {
      if (err) {
        rej(err);
      } else {
        res();
      }
    });
  });
}

async function backupAsar(path, backupPath) {
  try {
    await exists(backupPath);
    return;
  } catch (e) {
    // not exists, continue ~
  }
  const s = await exists(path);
  if (s.isDirectory()) {
    throw new Error("Is Dir!");
  }
  return new Promise((res, rej) => {
    fs.copyFile(path, backupPath, err => {
      if (err) {
        rej(err);
      } else {
        res();
      }
    });
  });
}

const [, , DYNALIST_HOME, FONT_NAME] = process.argv;

if (!FONT_NAME) {
  console.log("Please give me \"font name\" like this: node index.js <path-to-dynalist> \"Fira Code\"");
  return;
}

const RESOURCES_DIR = path.join(DYNALIST_HOME, "resources");
const TEMP_DIR = path.join(RESOURCES_DIR, "temp");

const APP_ASAR_NAME = "app.asar";
const DYNALIST_ASAR_NAME = "dynalist.asar";

const APP_ASAR = path.join(RESOURCES_DIR, APP_ASAR_NAME);
const DYNALIST_ASAR = path.join(RESOURCES_DIR, DYNALIST_ASAR_NAME);
const BACKUP_APP_ASAR = APP_ASAR + "backup";
const BACKUP_DYNALIST_ASAR = DYNALIST_ASAR + "backup";

const APP_DIR = path.join(TEMP_DIR, "app");
const DYNALIST_DIR = path.join(TEMP_DIR, "dynalist");

function main() {
  const clear = async path => {
    try {
      await existsDir(path);
      console.log("clear:", `exists [${path}]`);
    } catch (e) {
      console.log("clear:", `not exists [${path}]`);
      return;
    }
    await removeDir(path);
    console.log("clear:", `has clear [${path}]`);
  };

  /**
   * Patch ```class Updater``` "_check()"
   */
  const patchApp = async () => {
    await backupAsar(APP_ASAR, BACKUP_APP_ASAR);
    await clear(APP_DIR);
    await asar.extractAll(BACKUP_APP_ASAR, APP_DIR);
    const appIndexJsFile = path.join(APP_DIR, "index.js");
    const appIndexJsContent = await readFile(appIndexJsFile);
    const checkFunctionStartIndex = appIndexJsContent.indexOf("_check(");
    const breakPoint = "data = JSON.parse(body);";
    let breakPointIndex = appIndexJsContent.indexOf(
      breakPoint,
      checkFunctionStartIndex
    );
    breakPointIndex = breakPointIndex + breakPoint.length;
    const left = appIndexJsContent.substring(0, breakPointIndex);
    const right = appIndexJsContent.substring(breakPointIndex);
    const newIndexJsContent = left + " delete data.packages.dynalist;" + right;
    await writeFile(appIndexJsFile, newIndexJsContent);
    await asar.createPackage(APP_DIR, APP_ASAR);
  };

  /**
   * Patch this code
   * ```
   * this.pref_font_css_el.innerHTML=".u-use-pref-font { "+o+s+"}"
   * ```
   */
  const patchDynalist = async () => {
    await backupAsar(DYNALIST_ASAR, BACKUP_DYNALIST_ASAR);
    await clear(DYNALIST_DIR);
    await asar.extractAll(BACKUP_DYNALIST_ASAR, DYNALIST_DIR);
    const jsFile = path.join(DYNALIST_DIR, "www/assets/js/main.min.js");
    const jsCode = await readFile(jsFile);
    const breakPoint =
      'this.pref_font_css_el.innerHTML=".u-use-pref-font { "+o+s+"}"';
    const breakPointIndex = jsCode.indexOf(breakPoint);
    if (breakPointIndex < 0) {
      throw new Error("Cant find break point!");
    }
    const newCode = jsCode.replace(
      '"+o+s+"',
      `font-family: \\"${FONT_NAME}\\"`
    );
    await writeFile(jsFile, newCode);
    await asar.createPackage(DYNALIST_DIR, DYNALIST_ASAR);
  };

  patchApp().catch(reason => {
    console.log("main:", "patch app fail:", reason);
  });

  patchDynalist().catch(reason => {
    console.log("main:", "patch dynalist fail:", reason);
  });
}

main();
