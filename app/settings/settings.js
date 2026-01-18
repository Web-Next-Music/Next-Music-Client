const { ipcRenderer } = require('electron');

// Параметры:
// needRestart - Полный перезапуск программы.
// needUpdate - Обновление страницы и ссылки (loadMainUrl).

const settings = [
    // Window Settings
    { id: 'alwaysOnTop' },
    { id: 'freeWindowResize' },
    { id: 'opacity03' },
    // Program Settings
    { id: 'newDesign', needUpdate: true },
    { id: 'addonsEnabled', needUpdate: true },
    { id: 'autoUpdate', needRestart: true },
    // Launch Settings
    { id: 'preloadWindow' },
    { id: 'autoLaunch', needRestart: true },
    { id: 'startMinimized' }
];

let currentConfig = {};

ipcRenderer.on('load-config', (event, config) => {
    currentConfig = config;
    settings.forEach(setting => {
        document.getElementById(setting.id).checked = config[setting.id];
    });
});

document.getElementById('saveButton').onclick = () => {
    const newConfig = {};
    let needRestart = false;
    let needUpdate = false;

    settings.forEach(setting => {
        const value = document.getElementById(setting.id).checked;
        newConfig[setting.id] = value;

        if (setting.needRestart && value !== currentConfig[setting.id]) {
            needRestart = true;
        } else if (setting.needUpdate && value !== currentConfig[setting.id]) {
            needUpdate = true;
        }
    });

    ipcRenderer.send('update-config', newConfig);
    ipcRenderer.send('set-always-on-top');
    ipcRenderer.send('free-window-resize');
    ipcRenderer.send('opacity-03');
    window.close();

    if (needRestart) {
        ipcRenderer.send('restart-app');
    } else if (needUpdate) {
        ipcRenderer.send('small-restart');
    }
};

// tooltip-target
const labels = document.querySelectorAll('.textButton');
const tooltipTarget = document.querySelector('.tooltip-target');
let hoverCount = 0;

function setDefaultText() {
    if (hoverCount === 0) {
        tooltipTarget.textContent = 'Hover over setting.';
        tooltipTarget.style.visibility = 'visible';
        tooltipTarget.style.opacity = 1;
    }
}

labels.forEach(label => {
    label.addEventListener('mouseenter', function() {
        hoverCount++;
        const tooltipText = label.querySelector('input').getAttribute('data-tooltip');
        tooltipTarget.textContent = tooltipText;
        tooltipTarget.style.visibility = 'visible';
        tooltipTarget.style.opacity = 1;
    });

    label.addEventListener('mouseleave', function() {
        hoverCount--;
        setTimeout(() => {
            if (hoverCount === 0) setDefaultText();
        }, 50);
    });
});

setDefaultText();

// Смена цвета кнопок
setInterval(() => {
    document.querySelectorAll('.textButton').forEach(label => {
        const checkbox = label.querySelector('input');
        label.classList.toggle('active', checkbox.checked);
        label.addEventListener('click', () => {
            checkbox.checked = !checkbox.checked;
            label.classList.toggle('active', checkbox.checked);
        });
    });
}, 100)