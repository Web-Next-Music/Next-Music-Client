const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const nextMusicDirectory = path.join(process.env.LOCALAPPDATA, 'Next Music');
const addonsDirectory = path.join(nextMusicDirectory, 'Addons');
const configFilePath = path.join(nextMusicDirectory, 'config.json');
let tray = null;
let mainWindow = null;
let settingsWindow = null;
let config = { 
    isNextMusic: false, 
    areAddonsEnabled: true, 
    autoLaunch: false, 
    startMinimized: false 
};
let isAutoLaunch = false;

function ensureDirectories() {
    if (!fs.existsSync(nextMusicDirectory)) {
        fs.mkdirSync(nextMusicDirectory, { recursive: true });
        showNotification();
    }
    if (!fs.existsSync(configFilePath)) {
        saveConfig();
    } else {
        loadConfig();
    }
    if (!fs.existsSync(addonsDirectory)) {
        fs.mkdirSync(addonsDirectory, { recursive: true });
    }
}

function showNotification() {
    const notification = new Notification({
        title: 'Next Music',
        body: 'Directory Next Music has been created. Click to open.',
        silent: false,
        icon: path.join(__dirname, 'icon.ico'),
    });

    notification.on('click', () => {
        shell.openPath(nextMusicDirectory).catch(err => {
            console.error('Error opening folder:', err);
        });
    });

    notification.show();
}

function loadConfig() {
    try {
        const data = fs.readFileSync(configFilePath, 'utf8');
        config = JSON.parse(data);
    } catch (err) {
        console.error('Error loading config:', err);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving config:', err);
    }
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'icon.ico'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Donate',
            click: () => {
                shell.openExternal('https://boosty.to/diramix');
            }
        },
        {
            label: 'Settings',
            click: createSettingsWindow
        },
        {
            type: 'separator'
        },
        {
            label: 'Exit',
            click: () => {
                app.exit()
            }
        }
    ]);
    tray.setToolTip('Next Music');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); });
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 400,
        height: 327,
        resizable: false,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    settingsWindow.loadURL(`file://${path.join(__dirname, 'settings/settings.html')}`);
    
    // Отправляем конфигурацию в окно настроек
    settingsWindow.webContents.on('did-finish-load', () => {
        settingsWindow.webContents.send('load-config', config);
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function loadMainUrl() {
    const url = config.isNextMusic ? 'https://next.music.yandex.ru/' : 'https://music.yandex.ru/';
    mainWindow.loadURL(url).catch(err => { console.error('Error loading URL:', err); });
}

function createWindow() {
    const showWindow = !isAutoLaunch && !config.startMinimized;
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: showWindow,
    });
    loadMainUrl();
    mainWindow.on('close', (event) => { event.preventDefault(); mainWindow.hide(); });
    mainWindow.webContents.on('did-finish-load', () => { applyAddons(); });
    if (config.startMinimized && isAutoLaunch) mainWindow.minimize();
}

function applyAddons() {
    if (config.areAddonsEnabled) {
        console.log('Loading addons:');
        loadFilesFromDirectory(addonsDirectory, '.css', (cssContent) => {
            const script = `(() => {
                const style = document.createElement('style');
                style.textContent = \`${cssContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;
                document.body.appendChild(style);
            })();`;
            mainWindow.webContents.executeJavaScript(script).catch(err => { console.error('Error inserting CSS:', err); });
        });
        loadFilesFromDirectory(addonsDirectory, '.js', (jsContent) => {
            mainWindow.webContents.executeJavaScript(jsContent).catch(err => { console.error('Error executing JS:', err); });
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
                if (err) { console.error('Error stating file:', err); return; }
                if (stat.isDirectory()) { loadFilesFromDirectory(filePath, extension, callback); }
                else if (path.extname(file) === extension) {
                    fs.readFile(filePath, 'utf8', (err, content) => {
                        if (err) { console.error(`Error reading ${file}:`, err); return; }
                        callback(content);
                    });
                }
            });
        });
    });
}

ipcMain.on('update-config', (event, newConfig) => {
    config = { ...config, ...newConfig };
    saveConfig();
    if (newConfig.isNextMusic !== undefined) loadMainUrl();
});

app.whenReady().then(() => {
    ensureDirectories();
    createWindow();
    createTray();
    watchAddonsDirectory();
    isAutoLaunch = app.getLoginItemSettings().openAtLogin;
    if (config.autoLaunch) app.setLoginItemSettings({ openAtLogin: true });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
