(function () {
    "use strict";

    const WS_URL = "ws://localhost:8765";
    let ws;

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => console.log("[WS] ✅ Connected to", WS_URL);
        ws.onerror = (e) => console.error("[WS] ❌ WS Error:", e);
        ws.onclose = () => {
            console.warn("[WS] ⚠️ Connection closed, reconnecting in 3 sec");
            setTimeout(connect, 3000);
        };
    }

    connect();

    function getPlayerData(playerEl) {
        if (!playerEl) return null;

        const img = playerEl.querySelector(
            "div.PlayerBarDesktopWithBackgroundProgressBar_coverContainer__dkNCG img.PlayerBarDesktopWithBackgroundProgressBar_cover__MKmEt"
        )?.src ?? null;

        const title = playerEl.querySelector(
            "html body.ym-font-music.ym-dark-theme div.WithTopBanner_root__P__x3 div.WithTopBanner_content__6Vh7a div.CommonLayout_root__WC_W1.DefaultLayout_root__7J0wo section.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK.CommonLayout_playerBar__zXRxq.PlayerBar_root__cXUnU div.PlayerBarDesktopWithBackgroundProgressBar_playerBar__mp0p9 div.PlayerBarDesktopWithBackgroundProgressBar_player__ASKKs div.PlayerBarDesktopWithBackgroundProgressBar_info__YnvZ_ div.PlayerBarDesktopWithBackgroundProgressBar_infoCard__i0cbW div.PlayerBarDesktopWithBackgroundProgressBar_description__5jHke div.Meta_root__R8n1h.Meta_root_withSecondaryColor___uENY div.Meta_metaContainer__7i2dp div.Meta_titleContainer__gDuXr div._MWOVuZRvUQdXKTMcOPx.LezmJlldtbHWqU7l1950.oyQL2RSmoNbNQf3Vc6YI.Z_WIr2W8JU4MPQek3hgR._3_Mxw7Si7j2g4kWjlpR.Meta_text__Y5uYH a.buOTZq_TKQOVyjMLrXvB.Meta_albumLink__gASh6 span._MWOVuZRvUQdXKTMcOPx.Z_WIr2W8JU4MPQek3hgR._3_Mxw7Si7j2g4kWjlpR.Meta_text__Y5uYH.Meta_title__GGBnH"
        )?.textContent?.trim() ?? null;

        const artists = playerEl.querySelector(
            ".PlayerBar_root__cXUnU * div.SeparatedArtists_root_clamp__SyvjM"
        )?.textContent?.trim() ?? null;

        const timeCurrent = playerEl.querySelector(
            "html body.ym-font-music.ym-dark-theme div.WithTopBanner_root__P__x3 div.WithTopBanner_content__6Vh7a div.CommonLayout_root__WC_W1.DefaultLayout_root__7J0wo section.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK.CommonLayout_playerBar__zXRxq.PlayerBar_root__cXUnU div.PlayerBarDesktopWithBackgroundProgressBar_playerBar__mp0p9 div.ChangeTimecodeBackground_root__B89FS.ChangeTimecodeBackground_root_isPlayingTrack__2naHL span._MWOVuZRvUQdXKTMcOPx.mxSPe5xpZnie9gpIqacd._3_Mxw7Si7j2g4kWjlpR.Timecode_root__TLT75.Timecode_root_start__pHG5N.TimecodeGroup_timecode__IJXpy.TimecodeGroup_timecode_current__wv9pb.ChangeTimecodeBackground_timecodeGroup__2VQ1N.ChangeTimecodeBackground_timecodeGroupCurrent__aGlrB.ChangeTimecodeBackground_important__OSzLR.TimecodeGroup_timecode_current_animation__kZUW_ span"
        )?.textContent ?? null;

        const timeEnd = playerEl.querySelector(
            "html body.ym-font-music.ym-dark-theme div.WithTopBanner_root__P__x3 div.WithTopBanner_content__6Vh7a div.CommonLayout_root__WC_W1.DefaultLayout_root__7J0wo section.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK.CommonLayout_playerBar__zXRxq.PlayerBar_root__cXUnU div.PlayerBarDesktopWithBackgroundProgressBar_playerBar__mp0p9 div.ChangeTimecodeBackground_root__B89FS.ChangeTimecodeBackground_root_isPlayingTrack__2naHL span._MWOVuZRvUQdXKTMcOPx.mxSPe5xpZnie9gpIqacd._3_Mxw7Si7j2g4kWjlpR.Timecode_root__TLT75.Timecode_root_end__LLQsh.TimecodeGroup_timecode__IJXpy.ChangeTimecodeBackground_timecodeGroup__2VQ1N.TimecodeGroup_timecode_end__kzP5g span"
        )?.textContent ?? null;

        return { img, title, artists, timeCurrent, timeEnd, ts: Date.now() };
    }

    function sendPlayerData(playerEl, index) {
        const data = getPlayerData(playerEl);
        if (!data) return;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ playerIndex: index, ...data }));
        }
    }

    // Observe each player for changes
    const players = document.querySelectorAll(
        "section.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBar_root__cXUnU"
    );

    players.forEach((playerEl, index) => {
        const observer = new MutationObserver(() => sendPlayerData(playerEl, index));
        observer.observe(playerEl, {
            childList: true,
            subtree: true,
            characterData: true
        });
    });
})();
