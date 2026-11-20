/**
 * ProgressBar - Reusable full-width progress bar component for long-running operations.
 * Encapsulates DOM creation, delayed visibility, fill animation,
 * WebSocket reconnection states, and clean unmounting.
 */

export const ProgressState = {
    IDLE: "IDLE",
    DELAY_3S: "DELAY_3S",
    ANIMATING: "ANIMATING",
    PAUSED_DISCONNECTED: "PAUSED_DISCONNECTED",
    PAUSED_RECONNECTING: "PAUSED_RECONNECTING",
    CANCELING: "CANCELING",
    DESTROYED: "DESTROYED"
};

export const operationKindLabels = {
    "mesh": "Generating mesh",
    "vdb-bake": "Baking OpenVDB grid",
    "step-translate": "Translating STEP",
    "step-convert": "Converting STEP",
    "ast-parse": "Parsing GSL source",
    "import": "Fetching package imports",
    "wgsl-build": "Evaluating geometry SDF nodes",
    "render": "Compiling WebGPU shader",
};

export class ProgressBar {
    constructor(options = {}) {
        const {
            targetContainer = "#canvas-container",
            onCancel = null,
            onPhaseChange = null,
            // How long an operation runs before the bar shows: background
            // work that finishes sooner never flashes it. 0 shows it at once.
            delayMs = 3000
        } = options;

        this.targetContainerArg = targetContainer;
        this.delayMs = delayMs;
        this.onCancel = onCancel;
        this.onPhaseChange = onPhaseChange;

        this.state = ProgressState.IDLE;
        this.delayTimer = null;
        this.animInterval = null;

        this.animationDurationMs = 10000;
        this.startTime = 0;
        this.currentKind = null;
        this.label = "";
        this.completed = 0;
        this.total = 0;
        this.baselinePct = 0;
        this.targetPct = 100;
        this.currentPct = 0;

        this.el = null;
        this.barEl = null;
        this.labelEl = null;

        this.onWindowResize = this.handleResize.bind(this);
    }

    getContainer() {
        if (typeof this.targetContainerArg === "string") {
            return document.querySelector(this.targetContainerArg);
        }
        return this.targetContainerArg;
    }

    setState(newState) {
        if (this.state === ProgressState.DESTROYED) return;
        this.state = newState;
        if (typeof this.onPhaseChange === "function") {
            this.onPhaseChange(this.state);
        }
    }

    createDOM() {
        if (this.el) return;
        const container = this.getContainer();
        if (!container) return;

        this.el = document.createElement("div");
        this.el.className = "omega-progress-area";
        this.el.setAttribute("role", "progressbar");
        this.el.setAttribute("aria-valuemin", "0");
        this.el.setAttribute("aria-valuemax", "100");
        this.el.setAttribute("aria-live", "polite");

        const barWrapper = document.createElement("div");
        barWrapper.className = "omega-progress-bar-wrapper";

        this.barEl = document.createElement("div");
        this.barEl.className = "omega-progress-bar-fill";
        barWrapper.appendChild(this.barEl);

        const labelWrapper = document.createElement("div");
        labelWrapper.className = "omega-progress-label-wrapper";

        this.labelEl = document.createElement("span");
        this.labelEl.className = "omega-progress-label-text";
        labelWrapper.appendChild(this.labelEl);

        this.el.appendChild(barWrapper);
        this.el.appendChild(labelWrapper);

        container.appendChild(this.el);
        window.addEventListener("resize", this.onWindowResize);
        if (typeof ResizeObserver !== "undefined" && container) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
                this.resizeRaf = requestAnimationFrame(() => {
                    this.handleResize();
                });
            });
            this.resizeObserver.observe(container);
        }
    }

    startProgress(kind, label, durationMs = 10000, completed = 0, total = 0) {
        if (this.state === ProgressState.DESTROYED) return;

        this.createDOM();

        if (this.currentKind !== kind) {
            this.currentKind = kind;
            this.baselinePct = 0;
            this.currentPct = 0;
        }

        const baseTitle = operationKindLabels[kind] || label || kind;
        this.label = label && baseTitle !== label ? `${baseTitle}: ${label}` : baseTitle;
        this.animationDurationMs = durationMs;
        this.completed = completed;
        this.total = total;
        this.startTime = Date.now();

        this.updateCalculatedPercentages();

        if (this.labelEl && this.state !== ProgressState.CANCELING) {
            this.labelEl.textContent = this.label;
            this.labelEl.title = this.label;
        }

        if (this.state === ProgressState.IDLE && this.delayMs <= 0) {
            this.showDOM();
            this.setState(ProgressState.ANIMATING);
            this.startAnimLoop();
        } else if (this.state === ProgressState.IDLE) {
            this.hideDOM();
            this.setState(ProgressState.DELAY_3S);
            clearTimeout(this.delayTimer);
            this.delayTimer = setTimeout(() => {
                if (this.state === ProgressState.DELAY_3S) {
                    this.showDOM();
                    this.setState(ProgressState.ANIMATING);
                    this.startAnimLoop();
                }
            }, this.delayMs);
        } else if (this.state === ProgressState.ANIMATING ||
                   this.state === ProgressState.PAUSED_DISCONNECTED ||
                   this.state === ProgressState.PAUSED_RECONNECTING) {
            this.showDOM();
            this.setState(ProgressState.ANIMATING);
            this.startAnimLoop();
        }
    }

    updateCalculatedPercentages() {
        if (this.total > 0) {
            this.baselinePct = (this.completed / this.total) * 100;
            this.targetPct = Math.min(100, ((this.completed + 1) / this.total) * 100);
        } else {
            this.baselinePct = this.currentPct;
            this.targetPct = 95;
        }
    }

    showDOM() {
        if (this.el) {
            this.el.style.display = "flex";
        }
    }

    hideDOM() {
        if (this.el) {
            this.el.style.display = "none";
        }
    }

    startAnimLoop() {
        clearInterval(this.animInterval);
        this.animInterval = setInterval(() => {
            this.tick();
        }, 100);
    }

    stopAnimLoop() {
        clearInterval(this.animInterval);
        this.animInterval = null;
    }

    tick() {
        if (this.state !== ProgressState.ANIMATING) return;

        const elapsed = Date.now() - this.startTime;
        const progressFrac = Math.min(1.0, elapsed / this.animationDurationMs);
        const currentPct = this.baselinePct + (this.targetPct - this.baselinePct) * progressFrac;
        this.currentPct = currentPct;

        if (this.barEl) {
            this.barEl.style.width = `${currentPct.toFixed(1)}%`;
        }
        if (this.el) {
            this.el.setAttribute("aria-valuenow", Math.round(currentPct).toString());
        }

        if (elapsed >= this.animationDurationMs) {
            this.stopAnimLoop();
        }
    }

    pauseDisconnected() {
        if (this.state === ProgressState.DESTROYED) return;
        this.stopAnimLoop();
        this.setState(ProgressState.PAUSED_DISCONNECTED);
        if (this.labelEl) {
            this.labelEl.textContent = "Disconnected";
        }
    }

    pauseReconnecting() {
        if (this.state === ProgressState.DESTROYED) return;
        this.stopAnimLoop();
        this.setState(ProgressState.PAUSED_RECONNECTING);
        if (this.labelEl) {
            this.labelEl.textContent = "Connecting...";
        }
    }

    setCanceling() {
        if (this.state === ProgressState.DESTROYED) return;
        this.setState(ProgressState.CANCELING);
        if (this.labelEl) {
            this.labelEl.textContent = "Canceling operation...";
        }
    }

    reset() {
        if (this.state === ProgressState.DESTROYED) return;
        clearTimeout(this.delayTimer);
        this.stopAnimLoop();
        this.hideDOM();
        this.currentKind = null;
        this.baselinePct = 0;
        this.targetPct = 100;
        this.currentPct = 0;
        this.setState(ProgressState.IDLE);
    }

    handleResize() {
        // Label text relies on CSS overflow: hidden and text-overflow: ellipsis
    }

    destroy() {
        this.reset();
        window.removeEventListener("resize", this.onWindowResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
            this.resizeRaf = null;
        }
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
            this.el = null;
        }
        this.setState(ProgressState.DESTROYED);
        this.barEl = null;
        this.labelEl = null;
    }
}
