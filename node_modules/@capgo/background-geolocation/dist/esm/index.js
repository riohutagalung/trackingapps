import { registerPlugin } from '@capacitor/core';
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation', {
    web: () => import('./web').then((m) => new m.BackgroundGeolocationWeb()),
});
export * from './definitions';
export { BackgroundGeolocation };
//# sourceMappingURL=index.js.map