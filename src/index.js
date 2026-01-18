const { app, BrowserWindow } = require("electron");
const path = require("path");

// Трей
const { createTray } = require('./app/tray/tray.js');

//Иконка
const appIcon = path.join(__dirname, "app/icons/icon-256.png");

// Пути Модулей
const preloadPath = path.join(__dirname, "app/preload/preload.html");

// Получаем папку для хранения данных приложения
const nextMusicDirectory = path.join(app.getPath("userData"), "Next Music");
const addonsDirectory = path.join(nextMusicDirectory, "Addons");
const configFilePath = path.join(nextMusicDirectory, "config.json");

let config = {
  // Window Settings
  alwaysOnTop: false,
  freeWindowResize: false,
  opacity03: false,
  // Program Settings
  newDesign: true,
  addonsEnabled: false,
  autoUpdate: true,
  // Launch Settings
  preloadWindow: true,
  autoLaunch: false,
  startMinimized: false,
};

app.whenReady().then(() => {
  createTray(appIcon, nextMusicDirectory);
  createWindow();


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

    // Показываем основное окно
    if (!config.startMinimized) {
      mainWindow.show();
    }
  });

  // При закрытии окна скрываем его вместо выхода
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
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
}