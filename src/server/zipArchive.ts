import zlib from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'path';
import { ProjectConfig, PromptBundle, ReferenceFile, ProjectArchiveMetadata } from '../types/index.ts';

export interface ZipEntry {
  path: string;
  data: Buffer;
}

/**
 * Pure Node.js ZIP archive builder and extractor.
 * Implements standard PKZIP 2.0 format with DEFLATE compression, CRC32 integrity validation,
 * path-traversal protection, and SHA-256 manifest hashing.
 */
export class ZipArchive {
  /**
   * Compresses a list of file entries into a valid ZIP archive buffer.
   */
  public static createZip(entries: ZipEntry[]): Buffer {
    const localHeaders: Buffer[] = [];
    const centralHeaders: Buffer[] = [];
    let currentOffset = 0;

    for (const entry of entries) {
      // Normalize entry path using forward slashes, strip leading slashes
      const entryPath = entry.path.replace(/\\/g, '/').replace(/^\/+/, '');
      const pathBuffer = Buffer.from(entryPath, 'utf8');

      const uncompressedData = entry.data;
      const crc = zlib.crc32(uncompressedData);
      const compressedData = zlib.deflateRawSync(uncompressedData);

      // Prefer compression unless compressed is larger
      const useDeflate = compressedData.length < uncompressedData.length;
      const compressionMethod = useDeflate ? 8 : 0;
      const dataToStore = useDeflate ? compressedData : uncompressedData;

      // 1. Local File Header
      const localHeader = Buffer.alloc(30 + pathBuffer.length);
      localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
      localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
      localHeader.writeUInt16LE(0x0800, 6); // Flags: UTF-8 filename
      localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
      localHeader.writeUInt16LE(0, 10); // Mod time
      localHeader.writeUInt16LE(0, 12); // Mod date
      localHeader.writeUInt32LE(crc, 14); // CRC-32
      localHeader.writeUInt32LE(dataToStore.length, 18); // Compressed size
      localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
      localHeader.writeUInt16LE(pathBuffer.length, 26); // Filename length
      localHeader.writeUInt16LE(0, 28); // Extra field length
      pathBuffer.copy(localHeader, 30);

      localHeaders.push(localHeader, dataToStore);

      // 2. Central Directory Header
      const centralHeader = Buffer.alloc(46 + pathBuffer.length);
      centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
      centralHeader.writeUInt16LE(20, 4); // Version made by
      centralHeader.writeUInt16LE(20, 6); // Version needed
      centralHeader.writeUInt16LE(0x0800, 8); // Flags: UTF-8
      centralHeader.writeUInt16LE(compressionMethod, 10); // Compression method
      centralHeader.writeUInt16LE(0, 12); // Mod time
      centralHeader.writeUInt16LE(0, 14); // Mod date
      centralHeader.writeUInt32LE(crc, 16); // CRC-32
      centralHeader.writeUInt32LE(dataToStore.length, 20); // Compressed size
      centralHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
      centralHeader.writeUInt16LE(pathBuffer.length, 28); // Filename length
      centralHeader.writeUInt16LE(0, 30); // Extra field length
      centralHeader.writeUInt16LE(0, 32); // Comment length
      centralHeader.writeUInt16LE(0, 34); // Disk number start
      centralHeader.writeUInt16LE(0, 36); // Internal file attributes
      centralHeader.writeUInt32LE(0, 38); // External file attributes
      centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
      pathBuffer.copy(centralHeader, 46);

      centralHeaders.push(centralHeader);

      currentOffset += localHeader.length + dataToStore.length;
    }

    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirSize = centralDirBuffer.length;
    const centralDirOffset = currentOffset;

    // 3. End of Central Directory Record (EOCD)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4); // Disk number
    eocd.writeUInt16LE(0, 6); // Disk where CD starts
    eocd.writeUInt16LE(entries.length, 8); // Number of records on this disk
    eocd.writeUInt16LE(entries.length, 10); // Total number of records
    eocd.writeUInt32LE(centralDirSize, 12); // Central dir size
    eocd.writeUInt32LE(centralDirOffset, 16); // Central dir offset
    eocd.writeUInt16LE(0, 20); // Comment length

    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
  }

  /**
   * Parses a ZIP archive buffer and extracts all entries with strict security checks.
   */
  public static parseZip(buffer: Buffer): ZipEntry[] {
    if (buffer.length < 22) {
      throw new Error('Invalid archive: buffer is too small to be a valid ZIP file.');
    }

    // Locate EOCD signature (0x06054b50) searching backward from end of buffer
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Corrupted or invalid ZIP archive: End of Central Directory signature not found.');
    }

    const totalRecords = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

    if (centralDirOffset + centralDirSize > buffer.length) {
      throw new Error('Corrupted ZIP archive: Central directory bounds exceed file size.');
    }

    const entries: ZipEntry[] = [];
    let cdPtr = centralDirOffset;

    for (let r = 0; r < totalRecords; r++) {
      if (cdPtr + 46 > buffer.length) {
        throw new Error('Corrupted ZIP archive: Central directory entry truncated.');
      }

      const sig = buffer.readUInt32LE(cdPtr);
      if (sig !== 0x02014b50) {
        throw new Error(`Corrupted ZIP archive: Invalid central directory signature at offset ${cdPtr}.`);
      }

      const compressionMethod = buffer.readUInt16LE(cdPtr + 10);
      const expectedCrc = buffer.readUInt32LE(cdPtr + 16);
      const compressedSize = buffer.readUInt32LE(cdPtr + 20);
      const uncompressedSize = buffer.readUInt32LE(cdPtr + 24);
      const filenameLength = buffer.readUInt16LE(cdPtr + 28);
      const extraLength = buffer.readUInt16LE(cdPtr + 30);
      const commentLength = buffer.readUInt16LE(cdPtr + 32);
      const localHeaderOffset = buffer.readUInt32LE(cdPtr + 42);

      const filename = buffer.toString('utf8', cdPtr + 46, cdPtr + 46 + filenameLength);

      // SECURITY: Path traversal protection
      const normalizedPath = filename.replace(/\\/g, '/');
      if (
        normalizedPath.includes('../') ||
        normalizedPath.includes('/..') ||
        normalizedPath.startsWith('/') ||
        /^[a-zA-Z]:/.test(normalizedPath)
      ) {
        throw new Error(`Security Violation: Path traversal detected in archive entry "${filename}".`);
      }

      // Read local header to get payload
      if (localHeaderOffset + 30 > buffer.length) {
        throw new Error(`Corrupted ZIP archive: Local header offset ${localHeaderOffset} out of bounds.`);
      }

      const localSig = buffer.readUInt32LE(localHeaderOffset);
      if (localSig !== 0x04034b50) {
        throw new Error(`Corrupted ZIP archive: Invalid local header signature for "${filename}".`);
      }

      const localFilenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraLength;

      if (dataOffset + compressedSize > buffer.length) {
        throw new Error(`Corrupted ZIP archive: Entry data for "${filename}" exceeds file size.`);
      }

      const rawData = buffer.subarray(dataOffset, dataOffset + compressedSize);
      let uncompressedData: Buffer;

      if (compressionMethod === 8) {
        uncompressedData = zlib.inflateRawSync(rawData);
      } else if (compressionMethod === 0) {
        uncompressedData = Buffer.from(rawData);
      } else {
        throw new Error(`Unsupported compression method ${compressionMethod} for "${filename}".`);
      }

      // Verify CRC32
      const computedCrc = zlib.crc32(uncompressedData);
      if (computedCrc !== expectedCrc) {
        throw new Error(
          `Integrity Check Failed: CRC32 mismatch for "${filename}" (expected ${expectedCrc}, got ${computedCrc}).`
        );
      }

      entries.push({
        path: normalizedPath,
        data: uncompressedData,
      });

      cdPtr += 46 + filenameLength + extraLength + commentLength;
    }

    return entries;
  }

  /**
   * Exports an entire project to a self-contained portable ZIP buffer.
   * Includes project configuration, prompt bundle, reference metadata, and physical asset files.
   * Explicitly excludes browser profiles, session data, cookies, and tokens.
   */
  public static exportProject(
    project: ProjectConfig,
    bundle: PromptBundle | null,
    references: ReferenceFile[],
    projectRootPath: string
  ): Buffer {
    const entries: ZipEntry[] = [];
    const checksums: Record<string, string> = {};

    // 1. project.json
    const projectJsonData = Buffer.from(JSON.stringify(project, null, 2), 'utf8');
    entries.push({ path: 'project.json', data: projectJsonData });
    checksums['project.json'] = crypto.createHash('sha256').update(projectJsonData).digest('hex');

    // 2. prompt-bundle.json
    if (bundle) {
      const bundleJsonData = Buffer.from(JSON.stringify(bundle, null, 2), 'utf8');
      entries.push({ path: 'prompt-bundle.json', data: bundleJsonData });
      checksums['prompt-bundle.json'] = crypto.createHash('sha256').update(bundleJsonData).digest('hex');
    }

    // 3. references.json
    // Sanitize references to use relative asset paths
    const sanitizedRefs = references.map((r) => {
      const copy = { ...r };
      if (copy.path) {
        copy.path = `assets/${copy.name}`;
      }
      return copy;
    });
    const refsJsonData = Buffer.from(JSON.stringify(sanitizedRefs, null, 2), 'utf8');
    entries.push({ path: 'references.json', data: refsJsonData });
    checksums['references.json'] = crypto.createHash('sha256').update(refsJsonData).digest('hex');

    // 4. Media Assets
    const candidateAssetDirs = [
      path.join(projectRootPath, 'assets'),
      path.join(projectRootPath, 'references'),
    ];

    for (const ref of references) {
      let assetBuffer: Buffer | null = null;

      // Check explicit ref.path
      if (ref.path && fs.existsSync(ref.path) && fs.statSync(ref.path).isFile()) {
        assetBuffer = fs.readFileSync(ref.path);
      } else {
        // Search in project asset directories
        for (const dir of candidateAssetDirs) {
          const cand = path.join(dir, ref.name);
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
            assetBuffer = fs.readFileSync(cand);
            break;
          }
        }
      }

      if (assetBuffer) {
        const assetPath = `assets/${ref.name}`;
        entries.push({ path: assetPath, data: assetBuffer });
        checksums[assetPath] = crypto.createHash('sha256').update(assetBuffer).digest('hex');
      }
    }

    // 5. archive-metadata.json
    const metadata: ProjectArchiveMetadata = {
      schemaVersion: 1,
      version: '1.0.0',
      projectId: project.id,
      projectName: project.name,
      exportedAt: new Date().toISOString(),
      checksums,
    };
    const metaDataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
    entries.push({ path: 'archive-metadata.json', data: metaDataBuffer });

    return ZipArchive.createZip(entries);
  }

  /**
   * Imports a portable project ZIP archive buffer into target directory.
   */
  public static importProject(
    buffer: Buffer,
    targetProjectDir: string,
    overrideId?: string,
    overrideName?: string
  ): {
    project: ProjectConfig;
    bundle: PromptBundle | null;
    references: ReferenceFile[];
  } {
    const entries = ZipArchive.parseZip(buffer);
    const entryMap = new Map<string, Buffer>();

    for (const entry of entries) {
      entryMap.set(entry.path, entry.data);
    }

    // Validate project.json exists
    const projectData = entryMap.get('project.json');
    if (!projectData) {
      throw new Error('Invalid project archive: missing "project.json".');
    }

    let project: ProjectConfig;
    try {
      project = JSON.parse(projectData.toString('utf8'));
    } catch (err: any) {
      throw new Error(`Invalid project archive: corrupted "project.json" (${err.message}).`);
    }

    // Apply overrides or sanitize IDs
    if (overrideId) project.id = overrideId;
    if (overrideName) project.name = overrideName;
    project.outputPath = targetProjectDir;
    project.updatedAt = new Date().toISOString();

    // Parse bundle if available
    let bundle: PromptBundle | null = null;
    const bundleData = entryMap.get('prompt-bundle.json');
    if (bundleData) {
      try {
        bundle = JSON.parse(bundleData.toString('utf8'));
      } catch {}
    }

    // Parse references if available
    let references: ReferenceFile[] = [];
    const refsData = entryMap.get('references.json');
    if (refsData) {
      try {
        references = JSON.parse(refsData.toString('utf8'));
      } catch {}
    }

    // Create target directory structure
    const assetsDir = path.join(targetProjectDir, 'assets');
    const projectDataDir = path.join(targetProjectDir, 'project-data');
    const inputDir = path.join(targetProjectDir, 'input');
    const outputDir = path.join(targetProjectDir, 'output');
    const outputImagesDir = path.join(outputDir, 'images');

    for (const d of [targetProjectDir, assetsDir, projectDataDir, inputDir, outputDir, outputImagesDir]) {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    }

    // Extract asset files
    for (const [entryPath, data] of entryMap.entries()) {
      if (entryPath.startsWith('assets/')) {
        const filename = path.basename(entryPath);
        const destPath = path.join(assetsDir, filename);
        fs.writeFileSync(destPath, data);
      }
    }

    // Update references with actual local file paths
    references = references.map((ref) => {
      const localAsset = path.join(assetsDir, ref.name);
      if (fs.existsSync(localAsset)) {
        return {
          ...ref,
          path: localAsset,
          size: fs.statSync(localAsset).size,
        };
      }
      return ref;
    });

    // Write project configuration files
    fs.writeFileSync(path.join(projectDataDir, 'project.json'), JSON.stringify(project, null, 2), 'utf8');

    if (bundle) {
      fs.writeFileSync(path.join(inputDir, 'prompt-bundle.json'), JSON.stringify(bundle, null, 2), 'utf8');
    }

    fs.writeFileSync(path.join(projectDataDir, 'references.json'), JSON.stringify(references, null, 2), 'utf8');

    return { project, bundle, references };
  }
}
