import fs from 'node:fs';
import { PromptBundle, ValidationResult, ValidationError, ReferenceFile } from '../types/index.ts';
import path from 'node:path';

/**
 * Calculates expected image count from video duration and interval.
 * Uses transparent ceiling rule: e.g. 120s / 5s = 24 images.
 * If 122s / 5s = 25 images (24 full 5s intervals + 1 final partial 2s interval).
 */
export function calculateExpectedImageCount(durationSeconds?: number, intervalSeconds?: number): number {
  if (!durationSeconds || !intervalSeconds || intervalSeconds <= 0 || durationSeconds <= 0) {
    return 0;
  }
  return Math.ceil(durationSeconds / intervalSeconds);
}

/**
 * Validates a prompt bundle against Canonical Schema 1.0 rules.
 */
export function validatePromptBundle(
  bundle: any,
  availableReferences: ReferenceFile[] = []
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!bundle || typeof bundle !== 'object') {
    return {
      valid: false,
      errors: [{ message: 'Input must be a valid JSON object.', severity: 'error' }],
      promptCount: 0,
    };
  }

  // Schema Version Check
  if (!bundle.schemaVersion) {
    errors.push({
      field: 'schemaVersion',
      message: 'Missing "schemaVersion" field. Expected "1.0".',
      severity: 'error',
    });
  } else if (bundle.schemaVersion !== '1.0') {
    errors.push({
      field: 'schemaVersion',
      message: `Unsupported schemaVersion "${bundle.schemaVersion}". Currently supported version is "1.0".`,
      severity: 'error',
    });
  }

  // Project metadata
  if (!bundle.project || typeof bundle.project !== 'object') {
    errors.push({
      field: 'project',
      message: 'Missing or invalid "project" configuration block.',
      severity: 'error',
    });
  } else {
    if (!bundle.project.name || typeof bundle.project.name !== 'string' || !bundle.project.name.trim()) {
      errors.push({
        field: 'project.name',
        message: 'Project name is required and cannot be empty.',
        severity: 'error',
      });
    }

    if (bundle.project.durationSeconds !== undefined) {
      if (typeof bundle.project.durationSeconds !== 'number' || bundle.project.durationSeconds <= 0) {
        errors.push({
          field: 'project.durationSeconds',
          message: 'Project durationSeconds must be a positive number.',
          severity: 'error',
        });
      }
    }

    if (bundle.project.imageIntervalSeconds !== undefined) {
      if (typeof bundle.project.imageIntervalSeconds !== 'number' || bundle.project.imageIntervalSeconds <= 0) {
        errors.push({
          field: 'project.imageIntervalSeconds',
          message: 'Project imageIntervalSeconds must be a positive number.',
          severity: 'error',
        });
      }
    }
  }

  // Prompts array
  if (!Array.isArray(bundle.prompts)) {
    errors.push({
      field: 'prompts',
      message: 'Bundle must contain a "prompts" array.',
      severity: 'error',
    });
    return {
      valid: false,
      errors,
      promptCount: 0,
    };
  }

  if (bundle.prompts.length === 0) {
    errors.push({
      field: 'prompts',
      message: 'Prompts array is empty. At least one prompt is required.',
      severity: 'error',
    });
  }

  const knownRefIds = new Set(availableReferences.map((r) => r.id));
  const seenPromptIds = new Set<string>();
  const seenSequences = new Set<number>();

  bundle.prompts.forEach((item: any, index: number) => {
    const itemPrefix = `Prompt #${index + 1}`;

    // Prompt ID
    if (!item.id || typeof item.id !== 'string' || !item.id.trim()) {
      errors.push({
        promptId: item.id || `INDEX-${index + 1}`,
        field: 'id',
        message: `${itemPrefix}: Prompt ID is required and cannot be blank.`,
        severity: 'error',
      });
    } else {
      const trimmedId = item.id.trim();
      if (seenPromptIds.has(trimmedId)) {
        errors.push({
          promptId: trimmedId,
          field: 'id',
          message: `Duplicate Prompt ID detected: "${trimmedId}". Prompt IDs must be unique across the project.`,
          severity: 'error',
        });
      }
      seenPromptIds.add(trimmedId);
    }

    // Sequence
    if (typeof item.sequence !== 'number' || item.sequence < 1) {
      errors.push({
        promptId: item.id,
        field: 'sequence',
        message: `${itemPrefix} (${item.id || 'unknown'}): sequence must be a positive integer starting at 1.`,
        severity: 'error',
      });
    } else {
      if (seenSequences.has(item.sequence)) {
        errors.push({
          promptId: item.id,
          field: 'sequence',
          message: `${itemPrefix} (${item.id}): duplicate sequence value "${item.sequence}". Sequence numbers must be unique to maintain deterministic order.`,
          severity: 'error',
        });
      }
      seenSequences.add(item.sequence);
    }

    // Prompt text
    if (!item.prompt || typeof item.prompt !== 'string' || !item.prompt.trim()) {
      errors.push({
        promptId: item.id,
        field: 'prompt',
        message: `${itemPrefix} (${item.id || 'unknown'}): prompt text is empty. A descriptive prompt is required.`,
        severity: 'error',
      });
    }

    // Timing checks if present
    if (item.startSeconds !== undefined && item.endSeconds !== undefined) {
      if (typeof item.startSeconds !== 'number' || item.startSeconds < 0) {
        errors.push({
          promptId: item.id,
          field: 'startSeconds',
          message: `${itemPrefix} (${item.id}): startSeconds must be a non-negative number.`,
          severity: 'error',
        });
      }
      if (typeof item.endSeconds !== 'number' || item.endSeconds <= item.startSeconds) {
        errors.push({
          promptId: item.id,
          field: 'endSeconds',
          message: `${itemPrefix} (${item.id}): endSeconds (${item.endSeconds}) must be greater than startSeconds (${item.startSeconds}).`,
          severity: 'error',
        });
      }
    }

    // References validation
    if (item.referenceIds) {
      if (!Array.isArray(item.referenceIds)) {
        errors.push({
          promptId: item.id,
          field: 'referenceIds',
          message: `${itemPrefix} (${item.id}): referenceIds must be an array of string IDs.`,
          severity: 'error',
        });
      } else if (knownRefIds.size > 0) {
        for (const refId of item.referenceIds) {
          if (!knownRefIds.has(refId)) {
            errors.push({
              promptId: item.id,
              field: 'referenceIds',
              message: `${itemPrefix} (${item.id}): refers to unknown reference ID "${refId}". Add this reference in Reference Manager first.`,
              severity: 'warning',
            });
          }
        }
      }
    }
  });

  const duration = bundle.project?.durationSeconds;
  const interval = bundle.project?.imageIntervalSeconds;
  let calculatedImageCount: number | undefined;

  if (duration && interval) {
    calculatedImageCount = calculateExpectedImageCount(duration, interval);
    if (bundle.prompts.length !== calculatedImageCount) {
      errors.push({
        field: 'prompts.length',
        message: `Plan discrepancy: Based on video duration of ${duration}s and interval of ${interval}s, expected ${calculatedImageCount} images, but bundle contains ${bundle.prompts.length} prompts.`,
        severity: 'warning',
      });
    }
  }

  const hasBlockingErrors = errors.some((e) => e.severity === 'error');

  return {
    valid: !hasBlockingErrors,
    errors,
    promptCount: Array.isArray(bundle.prompts) ? bundle.prompts.length : 0,
    calculatedImageCount,
  };
}

/**
 * Sorts prompts deterministically by sequence or ID.
 */
export function sortPromptsDeterministically(prompts: any[]): any[] {
  return [...prompts].sort((a, b) => {
    if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
      return a.sequence - b.sequence;
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Validates file existence, non-emptiness, and verifies valid image/media header signatures.
 * Supports PNG, JPEG, WebP, GIF, SVG, and PDF.
 */
export function validateImageFile(
  filePath: string,
  allowedMimes: string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']
): { valid: boolean; format?: string; mimeType?: string; sizeBytes?: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Output file does not exist on disk.' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: 'Output file is 0 bytes (empty file).' };
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(32);
  const bytesRead = fs.readSync(fd, buffer, 0, 32, 0);
  fs.closeSync(fd);

  if (bytesRead < 4) {
    return { valid: false, error: 'File is too short to contain a valid image header.' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: 'PNG', mimeType: 'image/png', sizeBytes: stats.size };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'JPEG', mimeType: 'image/jpeg', sizeBytes: stats.size };
  }

  // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: 'WEBP', mimeType: 'image/webp', sizeBytes: stats.size };
  }

  // GIF: 47 49 46 38 (GIF8)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { valid: true, format: 'GIF', mimeType: 'image/gif', sizeBytes: stats.size };
  }

  // PDF: 25 50 44 46 (%PDF)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { valid: true, format: 'PDF', mimeType: 'application/pdf', sizeBytes: stats.size };
  }

  // SVG: starts with XML declaration or <svg
  const headerStr = buffer.toString('utf8').trim().toLowerCase();
  if (headerStr.startsWith('<?xml') || headerStr.startsWith('<svg')) {
    return { valid: true, format: 'SVG', mimeType: 'image/svg+xml', sizeBytes: stats.size };
  }

  return {
    valid: false,
    error: `File signature does not match any recognized image format (Header hex: ${buffer.subarray(0, 8).toString('hex')}).`,
  };
}

/**
 * Validates a text/markdown reference file (.txt, .md).
 * Checks readability, non-empty content, and valid UTF-8 encoding.
 */
export function validateTextFile(
  filePath: string
): { valid: boolean; format?: string; mimeType?: string; sizeBytes?: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Text file does not exist on disk.' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: 'Text file is empty.' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) {
      return { valid: false, error: 'Text file contains no readable content.' };
    }

    const ext = filePath.toLowerCase().endsWith('.md') ? 'Markdown' : 'Text';
    return {
      valid: true,
      format: ext,
      mimeType: ext === 'Markdown' ? 'text/markdown' : 'text/plain',
      sizeBytes: stats.size,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Text file is not readable: ${err.message}`,
    };
  }
}

/**
 * Validates a JSON reference file (.json).
 * Parses JSON and reports errors with filename context.
 * Does not modify the original file content.
 */
export function validateJsonFile(
  filePath: string
): { valid: boolean; format?: string; mimeType?: string; sizeBytes?: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'JSON file does not exist on disk.' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: 'JSON file is empty.' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content); // Validate parseable; do not modify

    return {
      valid: true,
      format: 'JSON',
      mimeType: 'application/json',
      sizeBytes: stats.size,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Invalid JSON in "${path.basename(filePath)}": ${err.message}`,
    };
  }
}

/**
 * Validates an MP4 video reference file (.mp4).
 * Checks for the ftyp box signature and reasonable file size.
 * Does not require FFmpeg or any external dependency.
 */
export function validateVideoFile(
  filePath: string
): { valid: boolean; format?: string; mimeType?: string; sizeBytes?: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Video file does not exist on disk.' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: 'Video file is empty.' };
  }

  // MP4 files are ISO Base Media Format. The ftyp box appears within the first 32 bytes.
  // Major brand is at offset 4-8, minor version at 8-12, compatible brands at 12+.
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(32);
  const bytesRead = fs.readSync(fd, buffer, 0, 32, 0);
  fs.closeSync(fd);

  if (bytesRead < 8) {
    return { valid: false, error: 'Video file is too short to contain an MP4 header.' };
  }

  // ftyp box: size (4 bytes) + 'ftyp' (4 bytes) at offset 4
  const ftypSig = buffer.subarray(4, 8).toString('ascii');
  if (ftypSig !== 'ftyp') {
    return {
      valid: false,
      error: `File signature does not match MP4 format (Header hex: ${buffer.subarray(0, 8).toString('hex')}).`,
    };
  }

  return {
    valid: true,
    format: 'MP4',
    mimeType: 'video/mp4',
    sizeBytes: stats.size,
  };
}

/**
 * Dispatches to the correct format-specific validator based on MIME type.
 * This is the single entry point for reference file validation.
 */
export function validateReferenceFile(
  filePath: string,
  mimeType: string
): { valid: boolean; format?: string; mimeType?: string; sizeBytes?: number; error?: string } {
  switch (mimeType) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
    case 'image/gif':
    case 'image/svg+xml':
    case 'application/pdf':
      return validateImageFile(filePath, [mimeType]);

    case 'text/plain':
    case 'text/markdown':
      return validateTextFile(filePath);

    case 'application/json':
      return validateJsonFile(filePath);

    case 'video/mp4':
      return validateVideoFile(filePath);

    default:
      return {
        valid: false,
        error: `Unsupported MIME type for validation: ${mimeType}`,
      };
  }
}
