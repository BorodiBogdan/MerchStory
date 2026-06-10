import { type Locator, type Page } from '@playwright/test';

// Types into an RN-web TextInput. RN-web fields sit inside a Pressable that focuses the input on
// click, and a freshly-mounted field can drop the first keystroke burst, so we clear and retype
// until the field holds the expected value. Keyboard typing (not fill) is used so the controlled
// input's onChangeText fires and React state updates.
export async function typeLocator(page: Page, input: Locator, value: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await input.click();
    if ((await input.inputValue()) !== '') {
      await input.press('ControlOrMeta+a');
      await input.press('Delete');
    }
    await page.keyboard.type(value);
    if ((await input.inputValue()) === value) return;
    // A cold-mounted, animating screen can swallow an early keystroke burst; let it settle.
    await page.waitForTimeout(200);
  }
  throw new Error(`Field did not accept the value "${value}" after repeated attempts`);
}

/** Type into a field addressed by its accessibility label. */
export function typeInto(page: Page, label: string, value: string, exact = false): Promise<void> {
  return typeLocator(page, page.getByLabel(label, { exact }), value);
}

/** Type into a field addressed by its placeholder text (RN inputs without an accessibility label). */
export function typeIntoPlaceholder(page: Page, placeholder: string, value: string): Promise<void> {
  return typeLocator(page, page.getByPlaceholder(placeholder), value);
}
