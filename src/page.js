import { scan, onPageLoad } from "./dom.js";

export function definePage(config) {
  const page = {
    refs: null,
    init() {
      this.refs = scan(config.root);
      config.setup?.call(this);
      config.bindings?.call(this);
      config.events?.call(this);
      config.onReady?.call(this);
    },
    destroy() {
      config.cleanup?.call(this);
    },
    ...config.methods,
  };
  return page;
}

export function mountPage(page) {
  onPageLoad(() => page.init());
  return page;
}
