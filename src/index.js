const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require('fs');

//Иконка
const appIcon = path.join(__dirname, "app/icons/icon-256.png");

// Пути Модулей
const preloadPath = path.join(__dirname, "app/preload/preload.html");

// Получаем папку для хранения данных приложения
const nextMusicDirectory = path.join(app.getPath("userData"), "Next Music");
const addonsDirectory = path.join(nextMusicDirectory, "Addons");
const configFilePath = path.join(nextMusicDirectory, "config.json");

// Трей
const { createTray } = require('./app/tray/tray.js');
let mainWindow;

let config = {
  // Window Settings
  alwaysOnTop: false,
  freeWindowResize: false,
  // Program Settings
  addonsEnabled: true,
  // Launch Settings
  preloadWindow: true,
  startMinimized: false,
};

app.whenReady().then(() => {
  initAppData(nextMusicDirectory, config);
  mainWindow = createWindow();
  createTray(appIcon, mainWindow, nextMusicDirectory);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function createPreloadWindow() {
  preloadWindow = new BrowserWindow({
    width: 240,
    height: 280,
    backgroundColor: "#000",
    show: true,
    resizable: false,
    fullscreenable: false,
    movable: true,
    frame: false,
    transparent: false,
    roundedCorners: true,
    icon: appIcon,
  });

  preloadWindow.loadURL(`file://${preloadPath}`)
}

function createWindow() {
  const showWindow = !config.startMinimized;

  // Если включен preload, создаём его перед основным окном
  if (config.preloadWindow && !config.startMinimized) {
    createPreloadWindow();
  }

  // Основное окно приложения
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    minWidth: config.freeWindowResize ? 0 : 800,
    minHeight: config.freeWindowResize ? 0 : 650,
    opacity: config.opacity03 ? 0.3 : 1,
    alwaysOnTop: config.alwaysOnTop,
    backgroundColor: '#0D0D0D',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // JS preload
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // окно будет показано после загрузки контента
  });

  // Загружаем основной URL приложения
  mainWindow.loadURL("https://music.yandex.ru/");

  // Когда страница основного окна загрузилась
  mainWindow.webContents.on('did-finish-load', () => {
    // Закрываем preload окно (если оно есть)
    if (config.preloadWindow && !config.startMinimized) {
      try {
        preloadWindow.close();
      } catch (err) {
        console.log('Preload window is missing');
      }
    }

    applyAddons();

    // Показываем основное окно
    if (!config.startMinimized) {
      mainWindow.show();
    }
  });

  // Если стартуем свернутым
  if (config.startMinimized) {
    mainWindow.hide();
  } else if (!config.preloadWindow) {
    mainWindow.show();
  }

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  return mainWindow;
}

function initAppData(nextMusicDirectory, defaultConfig) {
  // 1. Создаём основную папку
  if (!fs.existsSync(nextMusicDirectory)) {
    fs.mkdirSync(nextMusicDirectory, { recursive: true });
    console.log("📁 Folder created:", nextMusicDirectory);
  }

  // 2. Создаём папку Addons
  if (!fs.existsSync(addonsDirectory)) {
    fs.mkdirSync(addonsDirectory, { recursive: true });
    console.log("📁 Folder created:", addonsDirectory);
  }

  // 3. Работа с конфигом
  let config;

  if (!fs.existsSync(configFilePath)) {
    // Конфига нет → создаём
    fs.writeFileSync(
      configFilePath,
      JSON.stringify(defaultConfig, null, 2),
      "utf-8"
    );
    console.log("⚙️ config.json created");

    config = { ...defaultConfig };
  } else {
    // Конфиг есть → читаем
    try {
      const raw = fs.readFileSync(configFilePath, "utf-8");
      config = JSON.parse(raw);
      console.log("⚙️ Config loaded");
    } catch (err) {
      console.error("❌ Error read config.json", err);

      config = { ...defaultConfig };
    }
  }

  return config;
}

function applyAddons() {
  if (config.addonsEnabled) {
    console.log('Loading addons:');
    loadFilesFromDirectory(addonsDirectory, '.css', (cssContent, filePath) => {
      console.log(`Load CSS: ${path.relative(addonsDirectory, filePath)}`);
      const script = `(() => {
                const style = document.createElement('style');
                style.textContent = \`${cssContent.replace(/\\/g, '\\\\').replace(/`/g, '\`')}\`;
                document.body.appendChild(style);
            })();`;
      mainWindow.webContents.executeJavaScript(script).catch(err => {
        console.error('Error inserting CSS:', err);
      });
    });
    loadFilesFromDirectory(addonsDirectory, '.js', (jsContent, filePath) => {
      console.log(`Load JS: ${path.relative(addonsDirectory, filePath)}`);
      mainWindow.webContents.executeJavaScript(jsContent).catch(err => {
        console.error('Error executing JS:', err);
      });
    });
  } else {
    console.log('Addons are disabled');
  }
}

function loadFilesFromDirectory(directory, extension, callback) {
  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
    files.forEach(file => {
      const filePath = path.join(directory, file);
      fs.stat(filePath, (err, stat) => {
        if (err) {
          console.error('Error stating file:', err);
          return;
        }
        if (stat.isDirectory()) {
          loadFilesFromDirectory(filePath, extension, callback);
        } else if (path.extname(file) === extension) {
          fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
              console.error(`Error reading ${file}:`, err);
              return;
            }
            callback(content, filePath);
          });
        }
      });
    });
  });
}