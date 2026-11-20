import { clearHighlights, setEditorDiagnostics } from "./editor.js";
import eventManager from "../ui/event-manager.js";

export let currentTab = "GSL";
export let pendingError = null; // { tab: "GSL" | "WGSL", entries: [...] } or null
export let pendingWarnings = null; // { tab: "GSL" | "WGSL", entries: [...] } or null
export let warningsVisible = false;

export function setTabNames(...names) {
    if (names.length === 1 && Array.isArray(names[0])) {
        names = names[0];
    }
    const container = document.querySelector('.editor-tab-container');
    if (!container) return;
    container.innerHTML = '';

    names.forEach(name => {
        const tabEl = document.createElement('div');
        tabEl.id = `tab-${name}`;
        tabEl.className = 'btn-switch';
        if (name === currentTab) {
            tabEl.classList.add('selected');
        }
        tabEl.textContent = name;
        tabEl.addEventListener('click', () => {
            if (currentTab === name) return;
            selectTab(name);
            clearHighlights();
        });
        container.appendChild(tabEl);
    });

    if (names.length > 0 && !names.includes(currentTab)) {
        selectTab(names[0]);
    } else {
        syncTabDiagnostics();
    }
}

export function selectTab(tab) {
    if (tab === currentTab) return;
    currentTab = tab;
    const container = document.querySelector('.editor-tab-container');
    if (container) {
        for (const child of container.children) {
            child.classList.toggle('selected', child.textContent === tab);
        }
    }
    eventManager.dispatchEvent("tab/selected", { "tab": tab });
    syncTabDiagnostics();
}

export function activeTabDiagnostics() {
    const active = [];
    if (pendingError && pendingError.tab === currentTab) {
        active.push(...pendingError.entries);
    }
    if (warningsVisible && pendingWarnings && pendingWarnings.tab === currentTab) {
        active.push(...pendingWarnings.entries);
    }
    return active;
}

function syncTabDiagnostics() {
    const container = document.querySelector('.editor-tab-container');
    if (container) {
        for (const child of container.children) {
            const name = child.textContent;
            const hasError = Boolean(pendingError && pendingError.tab === name && currentTab !== name);
            const hasWarning = Boolean(
                !hasError && warningsVisible && pendingWarnings &&
                pendingWarnings.tab === name && currentTab !== name
            );
            child.classList.toggle('has-error', hasError);
            child.classList.toggle('has-warning', hasWarning);
        }
    }
    setEditorDiagnostics(activeTabDiagnostics());
}

export function setPendingError(tab, entries) {
    pendingError = (entries && entries.length) ? { tab, entries } : null;
    syncTabDiagnostics();
}

export function clearPendingError() {
    setPendingError(null, []);
}

export function setPendingWarnings(tab, entries) {
    pendingWarnings = (entries && entries.length) ? { tab, entries } : null;
    syncTabDiagnostics();
}

export function clearPendingWarnings() {
    setPendingWarnings(null, []);
}

export function setWarningsVisible(visible) {
    const next = Boolean(visible);
    if (warningsVisible === next) return;
    warningsVisible = next;
    syncTabDiagnostics();
}

export function refreshPendingError() {
    syncTabDiagnostics();
}
