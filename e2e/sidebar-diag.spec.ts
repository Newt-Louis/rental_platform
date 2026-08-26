import { test } from '@playwright/test';

test('sidebar nav link diagnostic', async ({ page }) => {
  // Login
  await page.goto('http://localhost:5173/login');
  await page.locator('#email').fill('admin@thiso.com');
  await page.locator('#password').fill('Admin123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // Locate the first <a> inside aside nav
  const anchor = page.locator('aside nav a').first();
  await anchor.waitFor({ state: 'visible', timeout: 10000 });

  // 1. className
  const anchorHandle = await anchor.elementHandle();
  const className = await anchor.getAttribute('class');
  console.log('=== ANCHOR className ===');
  console.log(JSON.stringify(className));

  // 2 & 3. computed display via both methods
  const computedDisplay = await page.evaluate((el) => {
    const cs = getComputedStyle(el as Element);
    return {
      display: cs.display,
      getPropertyValue: cs.getPropertyValue('display'),
    };
  }, anchorHandle);
  console.log('=== ANCHOR getComputedStyle.display ===');
  console.log(JSON.stringify(computedDisplay));

  // 4. Check for inline style on element and all ancestors
  const inlineStyles = await page.evaluate((el) => {
    const results: Array<{ tag: string; cls: string; style: string }> = [];
    let node: Element | null = el as Element;
    while (node) {
      const inlineStyle = (node as HTMLElement).style?.cssText;
      if (inlineStyle) {
        results.push({ tag: node.tagName, cls: node.className, style: inlineStyle });
      }
      node = node.parentElement;
    }
    return results;
  }, anchorHandle);
  console.log('=== INLINE STYLES on element + ancestors ===');
  console.log(JSON.stringify(inlineStyles, null, 2));

  // 5. Search all stylesheets for .block rule
  const blockRule = await page.evaluate(() => {
    const matches: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          const text = rule.cssText;
          if (/^\.block\s*\{/.test(text) || ((rule as CSSStyleRule).selectorText === '.block')) {
            matches.push(text);
          }
        }
      } catch {
        // CORS-restricted sheet, skip
      }
    }
    return matches;
  });
  console.log('=== .block CSS RULES found in stylesheets ===');
  console.log(JSON.stringify(blockRule, null, 2));

  // 6. Check parent element computed display
  const parentDisplay = await page.evaluate((el) => {
    const parent = (el as Element).parentElement;
    if (!parent) return null;
    const cs = getComputedStyle(parent);
    return {
      tag: parent.tagName,
      className: parent.className,
      display: cs.display,
    };
  }, anchorHandle);
  console.log('=== PARENT element computed display ===');
  console.log(JSON.stringify(parentDisplay, null, 2));

  // Also get the grandparent
  const grandParentDisplay = await page.evaluate((el) => {
    const gp = (el as Element).parentElement?.parentElement;
    if (!gp) return null;
    const cs = getComputedStyle(gp);
    return {
      tag: gp.tagName,
      className: gp.className,
      display: cs.display,
    };
  }, anchorHandle);
  console.log('=== GRANDPARENT element computed display ===');
  console.log(JSON.stringify(grandParentDisplay, null, 2));
});
