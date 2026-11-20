
// ── Progress bars ──────────────────────────────────────────────────────────
//
// Lightweight progress-bar primitive, keyed by id so multiple long-running
// jobs (e.g. several SDF bakes from a multi-import) can show concurrently
// without stomping each other. Each bar is a row stacked in a fixed
// container under #progress-bars; the container is created lazily on first
// use so callers don't have to remember to add markup.
const progressBars = new Map();

function ensureProgressContainer() {
    let el = document.getElementById('progress-bars');
    if (!el) {
        el = document.createElement('div');
        el.id = 'progress-bars';
        document.body.appendChild(el);
    }
    return el;
}

// setProgressBar shows or updates a bar identified by `id`.
//   label    : primary text shown above the bar
//   fraction : 0..1 (clamped); pass null/undefined for an indeterminate bar
//
// The bar tracks its own start time and a *cached prediction* of the total
// duration. When a fraction is supplied, the prediction is recomputed as
// `elapsed / fraction`. Between calls — e.g. while waiting for the next
// progress event — a 4 Hz ticker keeps re-rendering the elapsed/remaining
// strings against `performance.now()`, so the countdown ticks down in real
// time and only "snaps" when fresher data arrives.
function setProgressBar(id, label, fraction) {
    const container = ensureProgressContainer();
    let bar = progressBars.get(id);
    if (!bar) {
        const row = document.createElement('div');
        row.className = 'progress-row';
        const labelEl = document.createElement('div');
        labelEl.className = 'progress-label';
        const etaEl = document.createElement('div');
        etaEl.className = 'progress-eta';
        const trackEl = document.createElement('div');
        trackEl.className = 'progress-track';
        const fillEl = document.createElement('div');
        fillEl.className = 'progress-fill';
        trackEl.appendChild(fillEl);
        row.appendChild(labelEl);
        row.appendChild(etaEl);
        row.appendChild(trackEl);
        container.appendChild(row);
        bar = {
            row, labelEl, etaEl, fillEl,
            startedAt: performance.now(),
            // predictedTotalMs: total run-time estimate; null when we have no
            // basis for one yet (indeterminate or fraction < 5%).
            predictedTotalMs: null,
            // complete: latches to true when fraction reaches 1, so the
            // ticker stops emitting an ETA and just shows elapsed.
            complete: false,
        };
        progressBars.set(id, bar);
    }
    bar.labelEl.textContent = label;
    if (fraction == null || !isFinite(fraction)) {
        bar.row.classList.add('indeterminate');
        bar.fillEl.style.width = '';
        bar.predictedTotalMs = null;
        bar.complete = false;
    } else {
        bar.row.classList.remove('indeterminate');
        const f = Math.max(0, Math.min(1, fraction));
        bar.fillEl.style.width = `${(f * 100).toFixed(1)}%`;
        if (f >= 1) {
            bar.predictedTotalMs = performance.now() - bar.startedAt;
            bar.complete = true;
        } else if (f >= 0.05) {
            // The baker sizes its progress fraction to track wall-clock
            // work, so the cumulative elapsed/fraction is an honest, stable
            // estimate — no smoothing or rate-windowing needed here. Between
            // events the ticker holds it steady, counting down at one
            // second per real second.
            bar.predictedTotalMs = (performance.now() - bar.startedAt) / f;
            bar.complete = false;
        } else {
            // Too early for a meaningful prediction — let the ticker just
            // show elapsed time until we have ≥5% to extrapolate from.
            bar.predictedTotalMs = null;
            bar.complete = false;
        }
    }
    renderBarEta(bar, performance.now());
    startProgressTicker();
}

// renderBarEta paints the elapsed / remaining string for one bar against the
// supplied `now`. Pure function of the bar's cached state — safe to call from
// both the public setter and the periodic ticker without rounding skew.
function renderBarEta(bar, now) {
    const elapsedMs = now - bar.startedAt;
    if (bar.predictedTotalMs == null) {
        bar.etaEl.textContent = elapsedMs > 1000 ? `${formatDuration(elapsedMs)} elapsed` : '';
        return;
    }
    if (bar.complete) {
        bar.etaEl.textContent = `${formatDuration(elapsedMs)} elapsed`;
        return;
    }
    const remainingMs = Math.max(0, bar.predictedTotalMs - elapsedMs);
    bar.etaEl.textContent =
        `${formatDuration(elapsedMs)} elapsed · ~${formatDuration(remainingMs)} remaining`;
}

// One shared ticker drives all active bars at ~4 Hz, started lazily and shut
// off when the last bar is cleared. Anything finer than 250 ms looks the
// same to a human and just burns CPU.
let progressTickerHandle = null;
function startProgressTicker() {
    if (progressTickerHandle != null) return;
    progressTickerHandle = setInterval(() => {
        const now = performance.now();
        for (const bar of progressBars.values()) {
            renderBarEta(bar, now);
        }
    }, 250);
}
function stopProgressTicker() {
    if (progressTickerHandle == null) return;
    clearInterval(progressTickerHandle);
    progressTickerHandle = null;
}

// formatDuration renders a millisecond duration as a compact human string:
// "0.5s", "12s", "1m 23s", "5m". Loses sub-second precision past 1s because
// "5m 32.4s remaining" is more noise than signal at that scale.
function formatDuration(ms) {
    if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function clearProgressBar(id) {
    const bar = progressBars.get(id);
    if (!bar) return;
    bar.row.remove();
    progressBars.delete(id);
    if (progressBars.size === 0) stopProgressTicker();
}

// ── Notifications ──────────────────────────────────────────────────────────

let notificationVisible = false;
let notificationTimeout = null;

function showNotification(isError, message, persistent = false) {
    if (isError) {
        console.error(message);
    }
    notificationVisible = true;
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }

    const notification = document.getElementById("notification");
    if (!notification) return;

    notification.innerHTML = "";

    const textSpan = document.createElement("span");
    textSpan.className = "notification-message";
    textSpan.textContent = message;
    notification.appendChild(textSpan);

    if (isError) {
        notification.classList.add("error");
        const dismissBtn = document.createElement("button");
        dismissBtn.className = "notification-dismiss";
        dismissBtn.setAttribute("type", "button");
        dismissBtn.textContent = "Dismiss";
        dismissBtn.addEventListener("click", () => {
            clearNotification();
        });
        notification.appendChild(dismissBtn);
    } else {
        notification.classList.remove("error");
    }

    notification.style.backgroundColor = isError ? "#241a1a" : "#18201c";
    notification.style.borderColor = isError ? "#593535" : "#344b3e";

    notification.style.display = "flex";

    // Small delay to allow display:flex to apply before transition
    requestAnimationFrame(() => {
        notification.style.transform = "translateY(0)";
        notification.style.opacity = "1";
    });

    if (!isError && !persistent) {
        notificationTimeout = setTimeout(() => {
            clearNotification();
        }, 5000);
    }
}

function clearNotification() {
    notificationVisible = false;
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }
    const notification = document.getElementById("notification");
    if (!notification) return;
    notification.style.transform = "translateY(-150%)";
    notification.style.opacity = "0";
    setTimeout(() => {
        if (!notificationVisible) {
            notification.style.display = "none";
            notification.innerHTML = "";
            notification.classList.remove("error");
        }
    }, 500);
}

export { showNotification, clearNotification, setProgressBar, clearProgressBar }
