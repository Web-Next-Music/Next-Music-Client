window.nextMusic = {
    nextText(text) {
        let nextText = null;

        if (text === "") {
            if (nextText) {
                nextText.remove();
                nextText = null;
            }
        } else {
            if (!nextText) {
                nextText = document.querySelector(`.TitleBar_nextText`);
            }
            nextText.textContent = text;
        }
    },
};
