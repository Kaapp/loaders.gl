import {FileProvider} from '@loaders.gl/loader-utils';
import {parseEoCDRecord} from './end-of-central-directory';
import {ZipSignature} from './search-from-the-end';

/**
 * zip central directory file header info
 * according to https://en.wikipedia.org/wiki/ZIP_(file_format)
 */
export type ZipCDFileHeader = {
  /** Compressed size */
  compressedSize: bigint;
  /** Uncompressed size */
  uncompressedSize: bigint;
  /** Extra field size */
  extraFieldLength: number;
  /** File name length */
  fileNameLength: number;
  /** File name */
  fileName: string;
  /** Extra field offset */
  extraOffset: bigint;
  /** Relative offset of local file header */
  localHeaderOffset: bigint;
};

// offsets accroding to https://en.wikipedia.org/wiki/ZIP_(file_format)
const CD_COMPRESSED_SIZE_OFFSET = 20n;
const CD_UNCOMPRESSED_SIZE_OFFSET = 24n;
const CD_FILE_NAME_LENGTH_OFFSET = 28n;
const CD_EXTRA_FIELD_LENGTH_OFFSET = 30n;
const CD_LOCAL_HEADER_OFFSET_OFFSET = 42n;
const CD_FILE_NAME_OFFSET = 46n;

export const signature: ZipSignature = [0x50, 0x4b, 0x01, 0x02];

/**
 * Parses central directory file header of zip file
 * @param headerOffset - offset in the archive where header starts
 * @param buffer - buffer containing whole array
 * @returns Info from the header
 */
export const parseZipCDFileHeader = async (
  headerOffset: bigint,
  buffer: FileProvider
): Promise<ZipCDFileHeader | null> => {
  if (
    Buffer.from(await buffer.slice(headerOffset, headerOffset + 4n)).compare(
      Buffer.from(signature)
    ) !== 0
  ) {
    return null;
  }

  let compressedSize = BigInt(await buffer.getUint32(headerOffset + CD_COMPRESSED_SIZE_OFFSET));

  let uncompressedSize = BigInt(await buffer.getUint32(headerOffset + CD_UNCOMPRESSED_SIZE_OFFSET));

  const extraFieldLength = await buffer.getUint16(headerOffset + CD_EXTRA_FIELD_LENGTH_OFFSET);

  const fileNameLength = await buffer.getUint16(headerOffset + CD_FILE_NAME_LENGTH_OFFSET);

  const fileName = new TextDecoder().decode(
    await buffer.slice(
      headerOffset + CD_FILE_NAME_OFFSET,
      headerOffset + CD_FILE_NAME_OFFSET + BigInt(fileNameLength)
    )
  );

  const extraOffset = headerOffset + CD_FILE_NAME_OFFSET + BigInt(fileNameLength);

  const oldFormatOffset = await buffer.getUint32(headerOffset + CD_LOCAL_HEADER_OFFSET_OFFSET);

  let fileDataOffset = BigInt(oldFormatOffset);
  let offsetInZip64Data = 4n;
  // looking for info that might be also be in zip64 extra field
  if (uncompressedSize === BigInt(0xffffffff)) {
    uncompressedSize = await buffer.getBigUint64(extraOffset + offsetInZip64Data);
    offsetInZip64Data += 8n;
  }
  if (compressedSize === BigInt(0xffffffff)) {
    compressedSize = await buffer.getBigUint64(extraOffset + offsetInZip64Data);
    offsetInZip64Data += 8n;
  }
  if (fileDataOffset === BigInt(0xffffffff)) {
    fileDataOffset = await buffer.getBigUint64(extraOffset + offsetInZip64Data); // setting it to the one from zip64
  }
  const localHeaderOffset = fileDataOffset;

  return {
    compressedSize,
    uncompressedSize,
    extraFieldLength,
    fileNameLength,
    fileName,
    extraOffset,
    localHeaderOffset
  };
};

/**
 * Create iterator over files of zip archive
 * @param fileProvider - file provider that provider random access to the file
 */
export async function* zipCDFileHeaderGenerator(fileProvider: FileProvider) {
  const {cdStartOffset} = await parseEoCDRecord(fileProvider);
  let cdHeader = await parseZipCDFileHeader(cdStartOffset, fileProvider);
  while (cdHeader) {
    yield cdHeader;
    cdHeader = await parseZipCDFileHeader(
      cdHeader.extraOffset + BigInt(cdHeader.extraFieldLength),
      fileProvider
    );
  }
}