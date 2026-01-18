const { Tray, Menu, shell, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let tray = null;
let settingsWindow = null;
let infoWindow = null;
const appIcon = path.join(__dirname, 'app/icons/icon.ico');
const nextMusicDirectory = path.join(process.env.LOCALAPPDATA, 'Next Music');

function createTray() {
    tray = new Tray(appIcon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Next Music folder',
            click: () => {
                shell.openPath(nextMusicDirectory).catch(err => {
                    console.error('Error opening folder:', err);
                });
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
            label: 'Download extensions',
            click: () => {
                shell.openExternal('https://github.com/Web-Next-Music/Next-Music-Extensions');
            }
        },
        {
            label: 'Donate',
            click: () => {
                shell.openExternal('https://boosty.to/diramix');
            }
        },
        {
            type: 'separator'
        },
        {
            label: 'Info',
            click: createInfoWindow
        },
        {
            label: 'Exit',
            click: () => {
                app.exit();
            }
        }
    ]);
    tray.setToolTip('Next Music');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 756,
        height: 452,
        resizable: false,
        autoHideMenuBar: true,
        alwaysOnTop: true,
        backgroundColor: '#16181E',
        icon: appIcon,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    settingsWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11') {
        event.preventDefault();
        }
    });

    settingsWindow.loadURL(`file://${path.join(__dirname, 'app/settings/settings.html')}`);

    settingsWindow.setMenu(null)

    settingsWindow.webContents.on('did-finish-load', () => {
        settingsWindow.webContents.send('load-config', config);
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function createInfoWindow() {
    if (infoWindow) {
        infoWindow.focus();
        return;
    }

    infoWindow = new BrowserWindow({
        width: 600,
        height: 400,
        resizable: false,
        autoHideMenuBar: true,
        alwaysOnTop: true,
        backgroundColor: '#030117',
        icon: appIcon,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    infoWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11') {
        event.preventDefault();
        }
    });

    infoWindow.loadURL(`file://${path.join(__dirname, 'app/info/info.html')}`);

    infoWindow.setMenu(null)

    infoWindow.webContents.on('did-finish-load', () => {
        infoWindow.webContents.send('load-config', config);
    });

    infoWindow.on('closed', () => {
        infoWindow = null;
    });
}

module.exports = { createTray };