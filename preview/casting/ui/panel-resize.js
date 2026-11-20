// Wires up <div class="splitter"> elements inside a flex row so the user
// can drag them to resize adjacent panels.
//
// Convention: each splitter resizes its PREVIOUS sibling. The first later
// sibling with flex-grow > 0 absorbs the change (so one trailing panel with
// `flex: 1` can soak up any amount a fixed panel on the left gives back).
//
// min-width on both the resized panel and the absorbing panel is respected.
// No persistence — reload returns to the CSS-declared sizes.

function findAbsorber(splitter) {
    let el = splitter.nextElementSibling;
    while (el) {
        const grow = parseFloat(getComputedStyle(el).flexGrow);
        if (grow > 0) return el;
        el = el.nextElementSibling;
    }
    return null;
}

function getMinWidth(el) {
    const v = parseFloat(getComputedStyle(el).minWidth);
    return isFinite(v) ? v : 0;
}

let stopResize;

function attachSplitter(splitter) {
    splitter.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const left = splitter.previousElementSibling;
        const absorber = findAbsorber(splitter);
        if (!left || !absorber) return;

        stopResize?.();
        e.preventDefault();
        splitter.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startLeft = left.getBoundingClientRect().width;
        const startAbsorber = absorber.getBoundingClientRect().width;
        const leftMin = getMinWidth(left);
        const absorberMin = getMinWidth(absorber);
        // Max left width: absorber must stay >= its min.
        const maxLeft = startLeft + (startAbsorber - absorberMin);

        splitter.classList.add("dragging");
        document.body.classList.add("resizing");
        const controller = new AbortController();
        const options = {signal: controller.signal};

        const onMove = (ev) => {
            if (ev.pointerId !== e.pointerId) return;
            if (!(ev.buttons & 1)) {
                stop(ev);
                return;
            }
            let w = startLeft + (ev.clientX - startX);
            if (w < leftMin) w = leftMin;
            if (w > maxLeft) w = maxLeft;
            // Pin left panel to an explicit pixel size. The absorber keeps
            // flex: 1 and shrinks/grows to compensate.
            left.style.flex = `0 0 ${w}px`;
        };
        const stop = (ev) => {
            if (ev?.pointerId != null && ev.pointerId !== e.pointerId) return;
            if (stopResize !== stop) return;
            stopResize = null;
            controller.abort();
            splitter.classList.remove("dragging");
            document.body.classList.remove("resizing");
            if (splitter.hasPointerCapture(e.pointerId)) {
                splitter.releasePointerCapture(e.pointerId);
            }
        };
        stopResize = stop;
        splitter.addEventListener("pointermove", onMove, options);
        splitter.addEventListener("pointerup", stop, options);
        splitter.addEventListener("pointercancel", stop, options);
        splitter.addEventListener("lostpointercapture", stop, options);
        window.addEventListener("blur", stop, options);
    });
}

export function initSplitters(root = document) {
    root.querySelectorAll(".splitter").forEach(attachSplitter);
}

// Auto-init on import.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initSplitters());
} else {
    initSplitters();
}
