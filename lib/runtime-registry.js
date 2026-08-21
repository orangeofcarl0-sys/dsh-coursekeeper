const handles = new Map();
export function registerSessionHandle(key, handle) {
    handles.set(key, handle);
}
export function unregisterSessionHandle(key) {
    handles.delete(key);
}
export function getSessionHandle(key) {
    return handles.get(key);
}
//# sourceMappingURL=runtime-registry.js.map