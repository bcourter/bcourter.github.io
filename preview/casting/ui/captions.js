// Captions: the document's @caption("text", startTime, endTime[, fade]) lines,
// shown centred at the bottom of the canvas while the animation clock is in
// each one's [startTime, endTime]. They follow the clock however it moves, so
// they play, pause and scrub with it.
//
// The compile response carries them as { text, startTime, endTime, fade }, the
// fade already resolved by the parser (0.5 s by default, at most half the
// interval). A zero field is omitted from that JSON, so each read defaults to 0.
//
// The text is set with textContent, never as markup: an exported page shows a
// document's captions to whoever opens it.

// opacityAt is how visible caption c is at time t: 0 outside its interval,
// ramping up over the fade after startTime and down over the fade before
// endTime, and 1 between.
export function opacityAt(c, t) {
    const start = c.startTime || 0;
    const end = c.endTime || 0;
    if (t < start || t > end) return 0;
    const fade = c.fade || 0;
    if (fade <= 0) return 1;
    return Math.min(1, (t - start) / fade, (end - t) / fade);
}

// createCaptions adds the caption layer to container and returns setCaptions,
// which replaces the captions shown. getTime reads the animation clock.
export function createCaptions(container, getTime) {
    const layer = document.createElement("div");
    layer.className = "caption-layer";
    layer.setAttribute("aria-live", "polite");
    container.appendChild(layer);

    let captions = [];
    let lines = [];
    let running = false;

    function tick() {
        if (captions.length === 0) {
            running = false;
            return;
        }
        const t = getTime();
        for (let i = 0; i < captions.length; i++) {
            const a = opacityAt(captions[i], t);
            const line = lines[i];
            // A hidden caption leaves the stack, so the ones showing sit at the bottom.
            line.hidden = a <= 0;
            line.style.opacity = String(a);
        }
        requestAnimationFrame(tick);
    }

    return function setCaptions(list) {
        captions = Array.isArray(list) ? list : [];
        layer.replaceChildren();
        lines = captions.map((c) => {
            const line = document.createElement("div");
            line.className = "caption-line";
            line.textContent = c.text || "";
            line.hidden = true;
            layer.appendChild(line);
            return line;
        });
        if (captions.length > 0 && !running) {
            running = true;
            requestAnimationFrame(tick);
        }
    };
}
