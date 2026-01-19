const { Tray, Menu, shell, BrowserWindow, app } = require('electron');
const path = require('path');

let infoWindow = null;          // окно инфо
const infoPath = path.join(__dirname, "../info/info.html"); // путь к html
let appIcon = null;             // сюда будем передавать иконку

function createInfoWindow(icon) {
    appIcon = icon;             // сохраняем иконку для окна

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

    infoWindow.loadFile(infoPath);

    infoWindow.setMenu(null);

    infoWindow.on('closed', () => {
        infoWindow = null;
    });
}

function createTray(iconPath, mainWindow, nextMusicDirectory) {
    const tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Next Music folder',
            click: () => {
                if (!nextMusicDirectory) {
                    console.error("nextMusicDirectory is undefined");
                    return;
                }

                shell.openPath(nextMusicDirectory); // кроссплатформенное открытие папки
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
            label: 'Exit',
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

module.exports = { createTray };
