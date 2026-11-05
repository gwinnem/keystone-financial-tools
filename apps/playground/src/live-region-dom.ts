import { LIVE_REGION_ATTRIBUTES, liveRegionText, VISUALLY_HIDDEN_STYLE, type DrawingTools } from 'keystone-financial-tools-typescript';

/**
 * The live region of the announcements for the plain TypeScript pages (NFR-A11Y-001): a polite region nobody sees that gets the
 * message of every `announce` event of `tools`. The framework pages use the live region component of their package; the TypeScript
 * package has no DOM code, so this is the demo's own. Returns the function that removes it.
 */
export function mountLiveRegion(parent: HTMLElement, tools: Pick<DrawingTools, 'on'>): () => void {
  const region = document.createElement('div');
  region.id = 'announcer';
  for (const [name, value] of Object.entries(LIVE_REGION_ATTRIBUTES)) region.setAttribute(name, value);
  Object.assign(region.style, VISUALLY_HIDDEN_STYLE);
  parent.append(region);
  const stop = tools.on('announce', (message) => {
    region.textContent = liveRegionText(region.textContent ?? '', message);
  });
  return () => {
    stop();
    region.remove();
  };
}
