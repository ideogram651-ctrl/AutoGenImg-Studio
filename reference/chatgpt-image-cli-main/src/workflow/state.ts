import type { PageImage, PageState, PageTurn } from "../types.js";

const WORKED_FOR_PATTERN_SOURCE = String.raw`\bWorked for\s+(?:(?:\d+)\s*(?:h(?:ours?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\s*){1,3}`;
const WORKED_FOR_PATTERN = new RegExp(WORKED_FOR_PATTERN_SOURCE, "i");
const WORKED_FOR_PATTERN_GLOBAL = new RegExp(WORKED_FOR_PATTERN_SOURCE, "gi");
const CONTROL_ONLY_PATTERN = /^(?:(?:Edit image|Share this image|编辑图片|分享此图片)\s*)+$/i;

export interface PendingImage extends PageImage {
  turnId: string;
}

export function newAssistantTurns(state: PageState, baselineTurnIds: string[]): PageTurn[] {
  const baseline = new Set(baselineTurnIds);
  return state.turns.filter((turn) => turn.turn === "assistant" && !baseline.has(turn.id));
}

export function newUserTurns(state: PageState, baselineTurnIds: string[]): PageTurn[] {
  const baseline = new Set(baselineTurnIds);
  return state.turns.filter((turn) => turn.turn === "user" && !baseline.has(turn.id));
}

export function userPromptWasSubmitted(state: PageState, baselineTurnIds: string[], prompt: string): boolean {
  const expected = normalizeText(prompt);
  if (!expected) return false;
  return newUserTurns(state, baselineTurnIds).some((turn) => normalizeText(turn.text).includes(expected));
}

export function collectPendingImages(turns: PageTurn[]): PendingImage[] {
  const seen = new Set<string>();
  const images: PendingImage[] = [];
  for (const turn of turns) {
    for (const image of turn.images) {
      if (!image.src || seen.has(image.src)) continue;
      seen.add(image.src);
      images.push({ ...image, turnId: turn.id });
    }
  }
  return images;
}

export function imagesAreReady(state: PageState, turns: PageTurn[], images: PendingImage[]): boolean {
  return images.length > 0 &&
    !state.generating &&
    turns.every((turn) => !turn.writing) &&
    images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

export function stableImageSignature(turns: PageTurn[], images: PendingImage[]): string {
  return JSON.stringify({
    turns: turns.map((turn) => ({ id: turn.id, writing: turn.writing })),
    images: images.map((image) => ({
      turnId: image.turnId,
      src: image.src,
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  });
}

export function findWorkedForText(turns: PageTurn[]): string | undefined {
  for (const turn of turns) {
    const candidate = turn.workedForText ?? turn.text.match(WORKED_FOR_PATTERN)?.[0];
    const exact = candidate?.match(WORKED_FOR_PATTERN)?.[0]?.trim();
    if (exact) return exact;
  }
  return undefined;
}

export function assistantText(turns: PageTurn[]): string {
  return turns
    .map((turn) => turn.text
      .replace(WORKED_FOR_PATTERN_GLOBAL, "")
      .trim())
    // With current page-state collection toolbar controls never enter `text`.
    // Retain this narrow compatibility cleanup for older stored task records,
    // but never remove control-like phrases embedded in assistant prose.
    .filter((text) => !CONTROL_ONLY_PATTERN.test(text) && !/^(?:编辑|Edit)$/i.test(text))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function looksContentBlocked(turns: PageTurn[]): boolean {
  const text = turns.map((turn) => turn.text).join("\n");
  return /(?:can't|cannot|unable to) (?:help|generate|create)|policy|violat|blocked|无法生成|不能生成|无法帮助|内容政策|请求被阻止|不符合.*政策/i.test(text);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
