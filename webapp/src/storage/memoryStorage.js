export const createMemoryStorage = (initialState = {}) => {
  const store = { ...initialState };

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = typeof value === 'string' ? value : String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    snapshot() {
      return { ...store };
    }
  };
};
