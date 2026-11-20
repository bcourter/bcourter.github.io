// Instant tooltips, shared by all web frontends.
//
// Side-effect module (like panel-resize.js): importing it creates the
// #tooltip div and wires document-level pointer listeners. Behavior:
//   - elements with a `title` attribute show it instantly (the native
//     delayed tooltip is suppressed by temporarily moving the text to
//     data-tip while hovered);
//   - elements with `data-tip` show that text;
//   - a `data-warn` attribute on the element or an ancestor wins over
//     both (used for warning tooltips, e.g. attachment warnings);
//   - a `data-tip-img` attribute (an image URL) shows that image above the
//     text, as the material grid's swatches do; set late, it is picked up
//     while the tooltip shows.
// The #tooltip element is styled by each app's stylesheet.

const _tip = document.createElement('div');
_tip.id = 'tooltip';
document.body.appendChild(_tip);
let _tipEl = null;
// While a tooltip is showing, watch its element's title: a control that
// rewrites its own title on click (e.g. a toggle) updates the text at once
// instead of on the next pointer move.
const _tipTitleObserver = new MutationObserver(() => {
    if (!_tipEl) return;
    const fresh = _tipEl.getAttribute('title');
    if (fresh) {
        _tipEl.dataset.tip = fresh;
        _tipEl.removeAttribute('title');
    }
    _tipRender(_tipEl.dataset.tip || '', _tipEl.dataset.tipImg);
});
// _tipRender fills the tooltip: the text, and the element's image above it
// when it has one.
let _tipText = null;
let _tipImgUrl = null;
function _tipRender(text, img) {
    _tipText = text;
    _tipImgUrl = img || null;
    _tip.textContent = '';
    if (_tipImgUrl) {
        const el = document.createElement('img');
        el.className = 'tooltip-image';
        el.src = _tipImgUrl;
        _tip.appendChild(el);
        const caption = document.createElement('div');
        caption.textContent = text;
        _tip.appendChild(caption);
    } else {
        _tip.innerText = text;
    }
}
function _tipFind(target) {
    // Prefer data-warn on an ancestor (warning tooltips on wraps)
    const warn = target.closest('[data-warn]');
    if (warn) return { el: warn, text: warn.dataset.warn, isWarn: true };
    const titled = target.closest('[title]') || target.closest('[data-tip]');
    if (titled) return { el: titled, text: titled.getAttribute('title') || titled.dataset.tip, isWarn: false };
    return null;
}
function _tipShow(match) {
    if (!match || !match.text) return;
    const { el, text, isWarn } = match;
    // Same element, same text: nothing to do. Same element, new text (a
    // toggle that rewrote its own title on click): fall through and refresh.
    if (_tipEl === el && _tipText === text && _tipImgUrl === (el.dataset.tipImg || null)) return;
    _tipTitleObserver.disconnect();
    _tipEl = el;
    if (!isWarn) {
        el.dataset.tip = text;
        el.removeAttribute('title');
        _tipTitleObserver.observe(el, { attributes: true, attributeFilter: ['title', 'data-tip-img'] });
    }
    _tipRender(text, isWarn ? null : el.dataset.tipImg);
    _tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 4;
    _tip.style.left = '0px';
    _tip.style.top = '0px';
    if (left + _tip.offsetWidth > window.innerWidth - 8) left = window.innerWidth - _tip.offsetWidth - 8;
    if (left < 4) left = 4;
    if (top + _tip.offsetHeight > window.innerHeight - 8) top = r.top - _tip.offsetHeight - 4;
    _tip.style.left = left + 'px';
    _tip.style.top = top + 'px';
}
function _tipHide() {
    if (!_tipEl) return;
    _tipTitleObserver.disconnect();
    if (_tipEl.dataset.tip) {
        // Restore the snapshot only if nothing set a fresh title while
        // hovered; otherwise the stale text would overwrite the new one.
        if (!_tipEl.hasAttribute('title')) _tipEl.setAttribute('title', _tipEl.dataset.tip);
        delete _tipEl.dataset.tip;
    }
    _tip.style.display = 'none';
    _tipEl = null;
}
document.addEventListener('pointerover', e => {
    const match = _tipFind(e.target);
    if (match) _tipShow(match);
    else _tipHide();
});
document.addEventListener('pointerout', e => {
    if (_tipEl && !_tipEl.contains(e.relatedTarget)) _tipHide();
});
