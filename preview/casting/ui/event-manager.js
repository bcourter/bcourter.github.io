class EventManager {
    constructor() {
        /**
         * @type {Map<string, Array<Function>>}
         * @private
         */
        this._listeners = new Map();

        /**
         * @type {Map<string, number>}
         * @private
         */
        this._dropCount = new Map();
    }

    /**
     * @param {string} path - The type of event to listen for.
     * @param {Function} listener - The function to be called when the event is dispatched.
     *      The function must take one argument (data).
     *      If the function returns "false" then no other listeners will be notified.
     * @throws {TypeError} If eventType is not a string or listener is not a function.
     */
    addListener(path, listener) {
        if (typeof path !== "string") {
            throw new TypeError("eventType must be a string");
        }

        if (typeof listener !== "function") {
            throw new TypeError("listener must be a function");
        }
        if (listener.length !== 1) {
            throw new Error(
                `listener for eventType "${path}" must accept exactly one argument`
            );
        }

        if (!this._listeners.has(path)) {
            this._listeners.set(path, []);
        }
        this._listeners.get(path).push(listener);
    }

    /**
     * Removes a listener for a specific event type.
     * @param {string} eventType - The type of event the listener is registered for.
     * @param {Function} listener - The listener function to remove.
     * @throws {TypeError} If eventType is not a string or listener is not a function.
     */
    removeListener(eventType, listener) {
        if (typeof eventType !== "string") {
            throw new TypeError("eventType must be a string");
        }

        if (this._listeners.has(eventType)) {
            const list = this._listeners.get(eventType);
            const index = list.indexOf(listener);
            if (index !== -1) {
                list.splice(index, 1);
            }
            if (list.length === 0) {
                this._listeners.delete(eventType);
            }
        }
    }

    /**
     * Dispatches an event to all registered listeners.
     * @param {string} eventType - The type of event to dispatch.
     * @param {any} [data] - Optional data to pass to the listeners.
     * @throws {TypeError} If eventType is not a string.
     */
    dispatchEvent(eventType, data) {
        if (typeof eventType !== "string") {
            throw new TypeError("eventType must be a string");
        }

        if (this._listeners.has(eventType)) {
            // iterate from most recently added first
            const listeners = this._listeners.get(eventType);
            for (let i = listeners.length - 1; i >= 0; i--) {
                const listener = listeners[i];
                let result = listener(data);
                if (result === false) {
                    break;
                }
            }
            return true;
        }

        const count = (this._dropCount.get(eventType) || 0) + 1;
        this._dropCount.set(eventType, count);
        if (count <= 3 || count === 10 || count === 20 || count == 100 || count == 1000 || count % 10000 === 0) {
            console.warn(`No listeners, dropped ${count} events of type "${eventType}":\n${data}`);
        }
        return false;
    }

    /**
     * Removes all listeners for a specific event type.
     * @param {string} eventType - The type of event to remove all listeners for.
     * @throws {TypeError} If eventType is not a string.
     */
    removeAllListeners(eventType) {
        if (typeof eventType !== "string") {
            throw new TypeError("eventType must be a string");
        }
        this._listeners.delete(eventType);
    }

    /**
     * Removes all listeners for all event types.
     */
    clearAllListeners() {
        this._listeners.clear();
    }
}

const eventManager = new EventManager();
export default eventManager
