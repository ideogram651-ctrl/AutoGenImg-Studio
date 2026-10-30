import path from "node:path";
import type { PageImage } from "../types.js";

// Keep this in sync with the parser in workflow/state.ts. A duration must be
// made entirely of explicit time units so that adjacent assistant prose is not
// accidentally treated as part of the metadata.
export const WORKED_FOR_PATTERN_SOURCE = String.raw`\bWorked for\s+(?:(?:\d+)\s*(?:h(?:ours?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\s*){1,3}`;

function literal(value: unknown): string {
  return JSON.stringify(value);
}

export function collectPageStateScript(): string {
  const workedForPatternSource = literal(WORKED_FOR_PATTERN_SOURCE);
  return `async page => {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    // Generated images are lazy-loaded. Merely reading naturalWidth leaves an
    // off-screen result at 0x0 forever, so reveal the newest assistant image
    // before collecting readiness state.
    const generatedImages = page.locator('section[data-turn="assistant"] img');
    const generatedImageCount = await generatedImages.count();
    if (generatedImageCount > 0) {
      await generatedImages.nth(generatedImageCount - 1)
        .evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
        .catch(() => {});
      await page.waitForTimeout(200);
    }
    return await page.evaluate(() => {
      const url = location.href;
      const bodyText = (document.body?.innerText || '').slice(0, 200000);
      const normalize = value => (value || '').replace(/\\s+/g, ' ').trim();
      const workedForPattern = new RegExp(${workedForPatternSource}, 'i');
      const turnElements = Array.from(document.querySelectorAll('section[data-turn][data-turn-id]'));
      const turns = turnElements.map(section => {
        const sources = new Map();
        if (section.getAttribute('data-turn') === 'assistant') {
          for (const image of Array.from(section.querySelectorAll('img'))) {
            const src = image.currentSrc || image.src || '';
            if (!src || (!src.includes('/backend-api/estuary/content') && !/generated image|已生成图片/i.test(image.alt || ''))) continue;
            const existing = sources.get(src);
            const candidate = {
              src,
              alt: image.alt || '',
              complete: Boolean(image.complete),
              naturalWidth: Number(image.naturalWidth || 0),
              naturalHeight: Number(image.naturalHeight || 0),
            };
            if (!existing || (!existing.alt && candidate.alt)) sources.set(src, candidate);
          }
        }
        const sectionText = normalize(section.innerText).slice(0, 120000);
        const worked = sectionText.match(workedForPattern)?.[0]?.trim();
        // Prefer the message body over the whole turn. The latter also contains
        // toolbar labels (Edit image, Share this image, and similar controls).
        const message = section.querySelector('[data-message-author-role]');
        let text = '';
        if (message) {
          text = normalize(message.innerText).slice(0, 120000);
        } else {
          const clone = section.cloneNode(true);
          for (const control of Array.from(clone.querySelectorAll('button, [role="button"], [role="toolbar"], [data-testid*="action"]'))) {
            control.remove();
          }
          text = normalize(clone.innerText).slice(0, 120000);
        }
        return {
          id: section.getAttribute('data-turn-id') || '',
          turn: section.getAttribute('data-turn') || '',
          writing: Boolean(section.querySelector('[data-writing-block]')),
          text,
          workedForText: worked,
          images: Array.from(sources.values()),
        };
      });
      const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
        .map(element => normalize(element.textContent))
        .filter(Boolean)
        .slice(0, 20);
      const composer = document.querySelector('#prompt-textarea');
      const loginRequired = !composer && (
        /\\/(auth|login)(\\/|$)/i.test(location.pathname) ||
        /log in|sign in|登录|登入/i.test(bodyText.slice(0, 20000))
      );
      const humanChallenge = /verify you are human|checking your browser|captcha|安全验证|验证您是真人|人机验证/i.test(bodyText.slice(0, 50000)) ||
        Boolean(document.querySelector('iframe[src*="captcha"], iframe[src*="challenge"], [data-captcha]'));
      const generating = turns.some(turn => turn.writing) || Boolean(document.querySelector(
        '[data-testid="stop-button"], button[aria-label*="Stop generating"], button[aria-label*="停止生成"]'
      ));
      const threadId = location.pathname.match(/^\\/c\\/([^/?#]+)/)?.[1];
      return {
        url,
        title: document.title || '',
        threadId,
        loginRequired,
        humanChallenge,
        generating,
        alerts,
        turns,
      };
    });
  }`;
}

export function ensureChatModeScript(): string {
  return `async page => {
    const conversationMode = await page.evaluate(() => {
      if (!/^\/c\//.test(location.pathname)) return { conversation: false, confirmed: false, work: false };
      const current = Array.from(document.querySelectorAll('a[href]'))
        .find(link => link.getAttribute('href') === location.pathname);
      if (!current) return { conversation: true, confirmed: false, work: false };
      const label = [current.getAttribute('aria-label'), current.textContent].filter(Boolean).join(' ');
      return { conversation: true, confirmed: true, work: /(?:^|[\\s,])Work(?:$|[\\s,])/i.test(label) };
    });
    if (conversationMode.conversation) {
      if (!conversationMode.confirmed) throw new Error('UI_CHANGED:conversation_mode_not_confirmed');
      if (conversationMode.work) throw new Error('WORK_MODE_FORBIDDEN:chat_mode_required');
      return { mode: 'chat', confirmed: true, source: 'conversation_label' };
    }
    const chat = page.getByRole('button', { name: 'Chat', exact: true }).filter({ visible: true });
    const work = page.getByRole('button', { name: 'Work', exact: true }).filter({ visible: true });
    if (await chat.count() !== 1 || await work.count() !== 1) {
      throw new Error('UI_CHANGED:chat_work_mode_switch_missing');
    }
    if (!await chat.isEnabled()) throw new Error('UI_CHANGED:chat_mode_disabled');
    await chat.click({ force: true });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const chatButton = buttons.find(element => (element.textContent || '').trim() === 'Chat');
      const workButton = buttons.find(element => (element.textContent || '').trim() === 'Work');
      if (!chatButton || !workButton) return { confirmed: false };
      const attrs = element => ({
        selected: element.getAttribute('aria-selected'),
        pressed: element.getAttribute('aria-pressed'),
        current: element.getAttribute('aria-current'),
        state: element.getAttribute('data-state'),
      });
      const chatAttrs = attrs(chatButton);
      const workAttrs = attrs(workButton);
      const semantic = chatAttrs.selected === 'true' || chatAttrs.pressed === 'true' || chatAttrs.current === 'true' ||
        /^(active|on|checked|selected)$/i.test(chatAttrs.state || '') ||
        workAttrs.selected === 'false' || workAttrs.pressed === 'false' || /^(inactive|off|unchecked)$/i.test(workAttrs.state || '');
      const chatStyle = getComputedStyle(chatButton);
      const workStyle = getComputedStyle(workButton);
      const visual = chatStyle.backgroundColor !== workStyle.backgroundColor || chatStyle.boxShadow !== workStyle.boxShadow;
      return { confirmed: semantic || visual, chatAttrs, workAttrs };
    });
    if (!state.confirmed) throw new Error('UI_CHANGED:chat_mode_not_confirmed');
    return { mode: 'chat', confirmed: true };
  }`;
}

export function ensureImageModeScript(): string {
  return `async page => {
    const composer = page.locator('#prompt-textarea');
    if (await composer.count() !== 1) throw new Error('LOGIN_REQUIRED:prompt_textarea_missing');
    const modeActive = async () => {
      const value = (await composer.innerText().catch(() => '')).replace(/\\s+/g, ' ').trim();
      if (/创建图片|Create image/i.test(value)) return true;
      for (const label of ['浏览灵感', 'Browse inspiration']) {
        const heading = page.getByRole('heading', { name: label, exact: true });
        if (await heading.count() > 0 && await heading.first().isVisible().catch(() => false)) return true;
      }
      return false;
    };
    if (await modeActive()) return { imageMode: true, alreadyActive: true };

    // ChatGPT currently exposes a home-page quick action before the plus menu.
    // Its pill can be under a continuous layout animation, so a normal
    // Playwright click may wait forever for element stability. The locator is
    // constrained to one visible button and force only skips that stability
    // wait; it does not bypass disabled state or an ambiguous selector.
    for (const label of ['生成图片', '创建图片', 'Generate image', 'Create image']) {
      const quickAction = page.locator('button').filter({ hasText: label });
      if (await quickAction.count() !== 1 || !await quickAction.isVisible().catch(() => false)) continue;
      await quickAction.click({ force: true });
      await page.waitForTimeout(500);
      if (await modeActive()) return { imageMode: true, activatedByQuickAction: true };
    }

    let plus = page.getByTestId('composer-plus-btn');
    if (await plus.count() !== 1) {
      plus = page.getByRole('button', { name: '添加文件等', exact: true });
    }
    if (await plus.count() !== 1) throw new Error('UI_CHANGED:composer_plus_button_missing');
    await plus.click({ force: true });
    await page.waitForTimeout(400);
    if (await modeActive()) return { imageMode: true, activatedByPlus: true };

    const labels = ['创建图片', 'Create image'];
    let clicked = false;
    for (const label of labels) {
      const candidates = page.getByText(label, { exact: true });
      const count = await candidates.count();
      for (let index = 0; index < count; index++) {
        const candidate = candidates.nth(index);
        if (!await candidate.isVisible().catch(() => false)) continue;
        const insideComposer = await candidate.evaluate(element => Boolean(element.closest('#prompt-textarea'))).catch(() => true);
        if (insideComposer) continue;
        await candidate.click({ force: true });
        clicked = true;
        break;
      }
      if (clicked) break;
    }
    if (!clicked) throw new Error('UI_CHANGED:create_image_menu_item_missing');
    await page.waitForTimeout(500);
    if (!await modeActive()) throw new Error('UI_CHANGED:create_image_mode_not_activated');
    return { imageMode: true, alreadyActive: false };
  }`;
}

export function uploadReferenceImagesScript(referenceImages: string[]): string {
  const basenames = referenceImages.map((item) => path.basename(item));
  return `async page => {
    const files = ${literal(referenceImages)};
    const basenames = ${literal(basenames)};
    if (!files.length) return { uploaded: 0, observed: true };
    let input = page.getByTestId('upload-photos-input');
    if (await input.count() !== 1) input = page.locator('#upload-files');
    if (await input.count() !== 1) throw new Error('UI_CHANGED:photo_upload_input_missing');
    const attachmentSnapshot = async () => page.evaluate(() => {
      const composer = document.querySelector('#prompt-textarea');
      const root = composer?.closest('form') || composer?.parentElement?.parentElement?.parentElement || document.body;
      const candidates = root.querySelectorAll([
        '[data-testid*="attachment"]',
        '[data-testid*="file-preview"]',
        '[data-testid*="upload-preview"]',
        'button[aria-label*="Remove"]',
        'button[aria-label*="remove"]',
        'button[aria-label*="移除"]',
        'img[src^="blob:"]'
      ].join(','));
      return new Set(Array.from(candidates).map(element => {
        const container = element.closest('[data-testid*="attachment"], [data-testid*="preview"]') || element;
        return [
          container.getAttribute('data-testid'),
          container.getAttribute('aria-label'),
          container.getAttribute('title'),
          container.textContent,
          container.matches('img') ? container.getAttribute('src') : container.querySelector('img')?.getAttribute('src')
        ].filter(Boolean).join('|');
      })).size;
    });
    const attachmentsBefore = await attachmentSnapshot();
    await input.setInputFiles(files);
    const started = Date.now();
    let observed = false;
    while (Date.now() - started < 90000) {
      const status = await page.evaluate(names => {
        const composer = document.querySelector('#prompt-textarea');
        const root = composer?.closest('form') || composer?.parentElement?.parentElement?.parentElement || document.body;
        const elements = Array.from(root.querySelectorAll('*')).slice(0, 3000);
        const haystack = elements.map(element => [
          element.getAttribute('alt'),
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.textContent,
        ].filter(Boolean).join(' ')).join(' ');
        const hasAllNames = names.every(name => haystack.includes(name));
        const previewCandidates = root.querySelectorAll([
          '[data-testid*="attachment"]',
          '[data-testid*="file-preview"]',
          '[data-testid*="upload-preview"]',
          'button[aria-label*="Remove"]',
          'button[aria-label*="remove"]',
          'button[aria-label*="移除"]',
          'img[src^="blob:"]'
        ].join(','));
        const previewCount = new Set(Array.from(previewCandidates).map(element => {
          const container = element.closest('[data-testid*="attachment"], [data-testid*="preview"]') || element;
          return [
            container.getAttribute('data-testid'),
            container.getAttribute('aria-label'),
            container.getAttribute('title'),
            container.textContent,
            container.matches('img') ? container.getAttribute('src') : container.querySelector('img')?.getAttribute('src')
          ].filter(Boolean).join('|');
        })).size;
        const busy = Boolean(root.querySelector('[aria-busy="true"], [data-state="loading"], [data-testid*="uploading"]'));
        return { hasAllNames, previewCount, busy };
      }, basenames);
      if (!status.busy && (status.hasAllNames || status.previewCount >= attachmentsBefore + files.length)) {
        observed = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    if (!observed) {
      const visibleErrors = await page.locator('[role="alert"]').allTextContents().catch(() => []);
      if (visibleErrors.some(text => /upload|上传|failed|失败/i.test(text))) {
        throw new Error('UPLOAD_FAILED:' + visibleErrors.join(' | '));
      }
      throw new Error('UPLOAD_NOT_CONFIRMED:expected_' + files.length + '_reference_images');
    }
    return { uploaded: files.length, observed: true };
  }`;
}

export function submitPromptScript(prompt: string, appendToImageMode: boolean): string {
  return `async page => {
    const prompt = ${literal(prompt)};
    const append = ${literal(appendToImageMode)};
    const composer = page.locator('#prompt-textarea');
    if (await composer.count() !== 1) throw new Error('LOGIN_REQUIRED:prompt_textarea_missing');
    if (append) {
      const current = (await composer.innerText()).replace(/\\s+/g, ' ').trim();
      if (!/创建图片|Create image/i.test(current)) throw new Error('UI_CHANGED:image_mode_marker_missing');
      // The image-mode pill is contenteditable=false. A plain click can leave the
      // caret before/on the pill, causing insertText() to be silently ignored.
      // Focus explicitly and move the caret after the pill before inserting.
      await composer.focus();
      await composer.press('End');
      await page.keyboard.insertText(prompt);
    } else {
      await composer.fill(prompt);
    }
    await page.waitForTimeout(200);
    const written = (await composer.innerText()).replace(/\\s+/g, ' ').trim();
    const expected = prompt.replace(/\\s+/g, ' ').trim();
    if (!written.includes(expected)) throw new Error('UI_CHANGED:prompt_text_not_inserted');
    const promptWasPosted = async () => {
      const turns = page.locator('section[data-turn="user"]');
      const count = await turns.count();
      for (let index = Math.max(0, count - 3); index < count; index += 1) {
        const text = (await turns.nth(index).innerText().catch(() => '')).replace(/\\s+/g, ' ').trim();
        if (text.includes(expected)) return true;
      }
      return false;
    };
    const promptStillPresent = async () => {
      const freshComposer = page.locator('#prompt-textarea');
      if (await freshComposer.count() !== 1) return false;
      const current = await freshComposer.innerText().catch(() => '');
      return current.replace(/\\s+/g, ' ').trim().includes(expected);
    };
    const waitUntilAccepted = async () => {
      for (let i = 0; i < 20; i += 1) {
        if (await promptWasPosted()) return true;
        await page.waitForTimeout(250);
      }
      return false;
    };
    const sendOnce = async () => {
      let send = page.getByTestId('send-button');
      if (await send.count() !== 1) {
        for (const name of ['发送提示', 'Send prompt', 'Send message']) {
          const candidate = page.getByRole('button', { name, exact: true });
          if (await candidate.count() === 1) { send = candidate; break; }
        }
      }
      if (await send.count() === 1 && await send.isEnabled()) await send.click({ force: true });
      else await composer.press('Enter');
    };
    // Keyboard submission avoids the animated send button and follows the
    // composer's native form path.
    await composer.press('Enter');
    if (!await waitUntilAccepted()) {
      // A rejected UI click can transiently clear/rebuild the composer. Never
      // retry when the prompt is no longer visibly present: submission state
      // is then ambiguous and a retry could duplicate the request.
      if (!await promptStillPresent()) throw new Error('SUBMISSION_UNCERTAIN:prompt_disappeared_without_user_turn');
      await sendOnce();
      if (!await waitUntilAccepted()) throw new Error('UI_CHANGED:send_not_accepted');
    }
    return { submitted: true, url: page.url() };
  }`;
}

export function deleteConversationScript(threadId: string): string {
  return `async page => {
    const threadId = ${literal(threadId)};
    const expectedPath = '/c/' + threadId;
    const openedPath = new URL(page.url()).pathname;
    if (openedPath !== expectedPath) {
      if (openedPath === '/') return { deleted: true, alreadyDeleted: true, threadId, url: page.url() };
      throw new Error('UI_CHANGED:managed_thread_not_open');
    }
    const pickUniqueVisible = async (role, names) => {
      for (const name of names) {
        const candidate = page.getByRole(role, { name, exact: true }).filter({ visible: true });
        if (await candidate.count() === 1) return candidate;
      }
      return undefined;
    };
    const options = await pickUniqueVisible('button', ['打开对话选项', 'Open conversation options']);
    if (!options) throw new Error('UI_CHANGED:conversation_options_missing');
    await options.click({ force: true });
    const remove = await pickUniqueVisible('menuitem', ['删除', 'Delete']);
    if (!remove) throw new Error('UI_CHANGED:delete_conversation_menu_item_missing');
    await remove.click({ force: true });
    const dialog = page.locator('[role="dialog"]').filter({ visible: true });
    if (await dialog.count() !== 1) throw new Error('UI_CHANGED:delete_confirmation_missing');
    let confirm;
    for (const name of ['删除', 'Delete']) {
      const candidate = dialog.getByRole('button', { name, exact: true });
      if (await candidate.count() === 1) { confirm = candidate; break; }
    }
    if (!confirm) throw new Error('UI_CHANGED:delete_confirmation_button_missing');
    await confirm.click({ force: true });
    await page.waitForURL(url => url.pathname !== expectedPath, { timeout: 15000 });
    return { deleted: true, threadId, url: page.url() };
  }`;
}

export function downloadImageScript(
  turnId: string,
  image: PageImage,
): string {
  return `async page => {
    const turnId = ${literal(turnId)};
    const source = ${literal(image.src)};
    const turn = page.locator('section[data-turn-id="' + turnId + '"]');
    if (await turn.count() !== 1) throw new Error('UI_CHANGED:assistant_turn_missing');
    const allImages = turn.locator('img');
    const imageCount = await allImages.count();
    let selected;
    for (let index = 0; index < imageCount; index++) {
      const candidate = allImages.nth(index);
      if (await candidate.getAttribute('src') === source) { selected = candidate; break; }
    }
    if (!selected) throw new Error('UI_CHANGED:generated_image_missing');
    const response = await page.request.get(source);
    if (!response.ok()) throw new Error('DOWNLOAD_FAILED:image_resource_http_' + response.status());
    const body = await response.body();
    return {
      source,
      contentType: response.headers()['content-type'] || '',
      bytes: body.length,
      base64: body.toString('base64')
    };
  }`;
}
