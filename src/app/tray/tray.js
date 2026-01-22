const { Tray, Menu, shell, BrowserWindow, app, ipcRenderer } = require('electron');
const path = require('path');
const { checkForUpdates } = require('../updater/updater.js');

let infoWindow = null;
const infoPath = path.join(__dirname, "../info/info.html");
let appIcon = null;

function createTray(iconPath, mainWindow, nextMusicDirectory, configFilePath) {
    const tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Next Music folder',
            click: () => {
                if (!nextMusicDirectory) {
                    console.error("nextMusicDirectory is undefined");
                    return;
                }

                shell.openPath(nextMusicDirectory);
            }
        },
        {
            label: 'Open config',
            click: () => {
                if (!configFilePath) {
                    console.error("configFilePath is undefined");
                    return;
                }

                shell.openPath(configFilePath);
            }
        },
        { type: 'separator' },
        {
            label: 'Download extensions',
            click: () => shell.openExternal('https://github.com/Web-Next-Music/Next-Music-Extensions')
        },
        {
            label: 'Donate',
            click: () => shell.openExternal('https://boosty.to/diramix')
        },
        { type: 'separator' },
        {
            label: 'Info',
            click: () => createInfoWindow(iconPath)
        },
        {
            label: 'Check updates',
            click: () => {
                checkForUpdates();
            }
        },
        {
            label: 'Restart',
            click: () => {
                app.relaunch();
                app.exit(0);
            }
        },
        {
            label: 'Quit',
            click: () => {
                // Снимаем все обработчики close, чтобы можно было выйти
                mainWindow.removeAllListeners('close');
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Next Music');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

function createInfoWindow(icon) {
    appIcon = icon;

    if (infoWindow) {
        infoWindow.focus();
        return;
    }

    infoWindow = new BrowserWindow({
        width: 585,
        height: 360,
        useContentSize: true,
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

    infoWindow.loadFile(infoPath);

    infoWindow.setMenu(null);

    infoWindow.on('closed', () => {
        infoWindow = null;
    });
}

module.exports = { createTray };