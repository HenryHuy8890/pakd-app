import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://hdsteel.github.io/pakd-app/' });
for (const k of ['window','document','localStorage','navigator','location','HTMLElement','HTMLCanvasElement','CustomEvent','Event']) {
  try { globalThis[k] = dom.window[k]; } catch(e) {}
}
globalThis.alert = () => {}; globalThis.confirm = () => false; globalThis.prompt = () => null;
globalThis.fetch = async () => ({ ok: false, status: 599, text: async () => '' });
const { default: React } = await import('react');
const { renderToString } = await import('react-dom/server');
const { App } = await import('./src/App.jsx');
const { ErrorBoundary } = await import('./src/components/pin.jsx');
const html = renderToString(React.createElement(ErrorBoundary, null, React.createElement(App)));
const ok = !html.includes('Đã xảy ra lỗi khi hiển thị');
console.log('Render length:', html.length, ok ? '✅ App render OK' : '❌ ErrorBoundary caught error');
if (!ok) process.exit(1);
// kiểm tra vài chuỗi UI quan trọng có mặt
for (const s of ['PAKD','Dòng Tiền','Tồn kho']) console.log(s, html.includes(s) ? '✓' : '✗ MISSING');
