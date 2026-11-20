import { showNotification, clearNotification } from "./notification.js";
import eventManager from "./event-manager.js";
import { updateShader, defaultWGSL, setShaderGrayscaleFilter } from "../render/viewer.js";

const errorWrapper = document.getElementById("error-wrapper");
const errorOutput = document.getElementById("error-output");
let hasCanvasError = false;
let hasWgslError = false;

eventManager.addListener("error", (event) => {
    if (event != null) {
        showError(event.message, event.wgsl, event.isStlErr);
    } else {
        clearError();
    }
});

export function showError(errMsg, isWgslErr, isStlErr) {
    if (errMsg != null && typeof errMsg !== "string") {
        errMsg = String(errMsg.message || errMsg);
    }
    if (errMsg == null || errMsg.trim() === "") {
        clearError();
        return;
    }

    if (hasCanvasError && (isWgslErr || isStlErr)) {
        return;
    }
    if (hasWgslError && isStlErr) {
        return;
    }
    hasCanvasError = !isWgslErr && !isStlErr;
    hasWgslError = !isStlErr;

    if (errorWrapper) {
        errorWrapper.classList.remove("hidden");
    }
    if (errorOutput) {
        errorOutput.value = errMsg;
    }

    let shortMsg = errMsg;
    if (shortMsg.length > 80) {
        shortMsg = shortMsg.substring(0, 80) + "...";
    }
    showNotification(true, shortMsg);

    if (isWgslErr) {
        updateShader(defaultWGSL, 1);
    }

    setShaderGrayscaleFilter(true);
}

export function clearError() {
    hasCanvasError = false;
    hasWgslError = false;
    clearNotification();
    if (errorWrapper) {
        errorWrapper.classList.add("hidden");
    }
    if (errorOutput) {
        errorOutput.value = "";
    }
    setShaderGrayscaleFilter(false);
}

let errorTimer = null;
let errorTimerName = null;
const ERROR_IDLE_MS = 10000;
let activeTimeoutMs = ERROR_IDLE_MS;

function armErrorTimer(timeoutMs = activeTimeoutMs) {
    activeTimeoutMs = timeoutMs;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
        errorTimer = null;
        showError((errorTimerName || "Compiler") + " is unresponsive", false, false);
    }, activeTimeoutMs);
}

export function startErrorTimer(name, timeoutMs = ERROR_IDLE_MS) {
    errorTimerName = name;
    activeTimeoutMs = timeoutMs;
    armErrorTimer(activeTimeoutMs);
}

export function resetErrorTimer(etaSeconds = 0) {
    if (etaSeconds > 0) {
        activeTimeoutMs = Math.min(130000, Math.max(ERROR_IDLE_MS, (10 + etaSeconds) * 1000));
    } else {
        activeTimeoutMs = ERROR_IDLE_MS;
    }
    if (errorTimer != null) {
        armErrorTimer(activeTimeoutMs);
    }
}

export function stopErrorTimer() {
    clearTimeout(errorTimer);
    errorTimer = null;
    activeTimeoutMs = ERROR_IDLE_MS;
}
