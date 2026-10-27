export type Mp4Box = {
  type: string;
  dataStart: number;
  end: number;
};

export const MAX_MP4_BOXES_PER_LEVEL = 4096;
export const MAX_AUDIO_SAMPLES = 100_000;

export class AudioInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioInspectionError";
  }
}

export function inspectM4a(bytes: Uint8Array) {
  try {
    const topLevel = readBoxes(bytes, 0, bytes.byteLength);
    const mdatPayloadBytes = topLevel
      .filter((box) => box.type === "mdat")
      .reduce((total, box) => total + box.end - box.dataStart, 0);
    if (
      !topLevel.some((box) => box.type === "ftyp") ||
      mdatPayloadBytes <= 0
    ) {
      throw new AudioInspectionError("Missing required MP4 boxes.");
    }

    const moov = topLevel.find((box) => box.type === "moov");
    if (!moov) throw new AudioInspectionError("Missing MP4 metadata.");

    const tracks = readBoxes(bytes, moov.dataStart, moov.end).filter(
      (box) => box.type === "trak",
    );
    let audioDuration: number | null = null;
    let audioTrackCount = 0;

    for (const track of tracks) {
      const mdia = readBoxes(bytes, track.dataStart, track.end).find(
        (box) => box.type === "mdia",
      );
      if (!mdia) continue;
      const mediaBoxes = readBoxes(bytes, mdia.dataStart, mdia.end);
      const handler = mediaBoxes.find((box) => box.type === "hdlr");
      if (!handler) continue;
      const handlerType = readFourCc(bytes, handler.dataStart + 8, handler.end);
      if (handlerType === "vide") throw new AudioInspectionError("Video tracks are not accepted.");
      if (handlerType !== "soun") continue;

      audioTrackCount += 1;
      const mdhd = mediaBoxes.find((box) => box.type === "mdhd");
      if (!mdhd) throw new AudioInspectionError("Missing audio duration metadata.");
      const mediaTiming = readMediaTiming(bytes, mdhd);

      const minf = mediaBoxes.find((box) => box.type === "minf");
      if (!minf) throw new AudioInspectionError("Missing audio media information.");
      const stbl = readBoxes(bytes, minf.dataStart, minf.end).find(
        (box) => box.type === "stbl",
      );
      if (!stbl) throw new AudioInspectionError("Missing audio sample table.");
      const sampleBoxes = readBoxes(bytes, stbl.dataStart, stbl.end);
      const stsd = sampleBoxes.find(
        (box) => box.type === "stsd",
      );
      const stts = sampleBoxes.find((box) => box.type === "stts");
      const stsz = sampleBoxes.find((box) => box.type === "stsz");
      if (!stsd || !stts || !stsz) {
        throw new AudioInspectionError("Missing required audio sample metadata.");
      }

      const description = readAacSampleDescription(bytes, stsd);
      if (description.sampleRate !== mediaTiming.timescale) {
        throw new AudioInspectionError("Audio sample rate and media timescale do not match.");
      }
      const sampleTiming = readSampleTiming(
        bytes,
        stts,
        mediaTiming.timescale,
        description.sampleRate,
      );
      const sampleSizes = readSampleSizes(bytes, stsz);
      if (sampleTiming.sampleCount !== sampleSizes.sampleCount) {
        throw new AudioInspectionError("Audio timing and sample counts do not match.");
      }
      if (sampleSizes.totalBytes <= 0 || sampleSizes.totalBytes > mdatPayloadBytes) {
        throw new AudioInspectionError("Audio sample bytes are invalid.");
      }
      if (Math.abs(mediaTiming.durationSeconds - sampleTiming.durationSeconds) > 0.25) {
        throw new AudioInspectionError("Audio duration metadata does not agree.");
      }
      audioDuration = sampleTiming.durationSeconds;
    }

    if (audioTrackCount !== 1 || audioDuration === null || audioDuration <= 0) {
      throw new AudioInspectionError("Expected one valid audio track.");
    }
    return { durationSeconds: audioDuration };
  } catch (error) {
    if (error instanceof AudioInspectionError) throw error;
    throw new AudioInspectionError("The recording file is invalid.");
  }
}

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    const size32 = readUint32(bytes, offset);
    const type = readFourCc(bytes, offset + 4, end);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > end) throw new AudioInspectionError("Invalid extended MP4 box.");
      const size64 = readUint64(bytes, offset + 8);
      if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new AudioInspectionError("MP4 box is too large.");
      }
      size = Number(size64);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) {
      throw new AudioInspectionError("Invalid MP4 box size.");
    }
    boxes.push({ type, dataStart: offset + headerSize, end: offset + size });
    if (boxes.length > MAX_MP4_BOXES_PER_LEVEL) {
      throw new AudioInspectionError("MP4 contains too many boxes.");
    }
    offset += size;
  }

  if (offset !== end) {
    const trailing = bytes.subarray(offset, end);
    if (trailing.some((value) => value !== 0)) throw new AudioInspectionError("Invalid MP4 padding.");
  }
  return boxes;
}

function readMediaTiming(bytes: Uint8Array, box: Mp4Box) {
  const version = bytes[box.dataStart];
  if (version === 0) {
    if (box.dataStart + 20 > box.end) throw new AudioInspectionError("Invalid mdhd box.");
    const timescale = readUint32(bytes, box.dataStart + 12);
    const duration = readUint32(bytes, box.dataStart + 16);
    if (timescale === 0) throw new AudioInspectionError("Invalid audio timescale.");
    return { timescale, durationSeconds: duration / timescale };
  }
  if (version === 1) {
    if (box.dataStart + 32 > box.end) throw new AudioInspectionError("Invalid mdhd box.");
    const timescale = readUint32(bytes, box.dataStart + 20);
    const duration = readUint64(bytes, box.dataStart + 24);
    if (timescale === 0) throw new AudioInspectionError("Invalid audio timescale.");
    return { timescale, durationSeconds: Number(duration) / timescale };
  }
  throw new AudioInspectionError("Unsupported mdhd version.");
}

function readAacSampleDescription(bytes: Uint8Array, stsd: Mp4Box) {
  if (stsd.dataStart + 16 > stsd.end) throw new AudioInspectionError("Invalid stsd box.");
  const entryCount = readUint32(bytes, stsd.dataStart + 4);
  const entryStart = stsd.dataStart + 8;
  const entrySize = readUint32(bytes, entryStart);
  const entryEnd = entryStart + entrySize;
  if (
    entryCount !== 1 ||
    entrySize < 36 ||
    entryEnd > stsd.end ||
    readFourCc(bytes, entryStart + 4, entryEnd) !== "mp4a"
  ) {
    throw new AudioInspectionError("The recording is not a single AAC sample entry.");
  }

  const version = readUint16(bytes, entryStart + 16);
  const channelCount = readUint16(bytes, entryStart + 24);
  const sampleSize = readUint16(bytes, entryStart + 26);
  const sampleRate = readUint32(bytes, entryStart + 32) / 65536;
  if (
    version !== 0 ||
    channelCount < 1 ||
    channelCount > 2 ||
    sampleSize !== 16 ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 48000
  ) {
    throw new AudioInspectionError(
      `Unsupported AAC recording parameters (${version}/${channelCount}/${sampleSize}/${sampleRate}).`,
    );
  }

  const esds = readBoxes(bytes, entryStart + 36, entryEnd).find(
    (box) => box.type === "esds",
  );
  if (!esds || esds.dataStart + 6 > esds.end) {
    throw new AudioInspectionError("Missing AAC decoder configuration.");
  }
  const config = readAudioSpecificConfig(
    bytes,
    esds.dataStart + 4,
    esds.end,
    sampleRate,
    channelCount,
  );
  if (
    config.audioObjectType !== 2 ||
    config.sampleRate !== sampleRate ||
    config.channelConfiguration !== channelCount
  ) {
    throw new AudioInspectionError(
      `AAC decoder configuration does not match (${config.audioObjectType}/${config.sampleRate}/${config.channelConfiguration}).`,
    );
  }

  return { sampleRate };
}

function readAudioSpecificConfig(
  bytes: Uint8Array,
  start: number,
  end: number,
  expectedSampleRate: number,
  expectedChannels: number,
) {
  for (let offset = start; offset < end - 2; offset += 1) {
    if (bytes[offset] !== 0x05) continue;
    const descriptor = readDescriptorLength(bytes, offset + 1, end);
    if (!descriptor || descriptor.length < 2 || descriptor.dataStart + descriptor.length > end) {
      continue;
    }

    try {
      const reader = createBitReader(
        bytes.subarray(descriptor.dataStart, descriptor.dataStart + descriptor.length),
      );
      let audioObjectType = reader.read(5);
      if (audioObjectType === 31) audioObjectType = 32 + reader.read(6);
      const frequencyIndex = reader.read(4);
      const sampleRates = [
        96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
        16000, 12000, 11025, 8000, 7350,
      ];
      const sampleRate = frequencyIndex === 15 ? reader.read(24) : sampleRates[frequencyIndex];
      const channelConfiguration = reader.read(4);
      if (
        audioObjectType === 2 &&
        sampleRate === expectedSampleRate &&
        channelConfiguration === expectedChannels
      ) {
        return { audioObjectType, sampleRate, channelConfiguration };
      }
    } catch {
      // Continue scanning the bounded esds payload for DecoderSpecificInfo.
    }
  }
  throw new AudioInspectionError("Invalid AAC decoder configuration.");
}

function readDescriptorLength(bytes: Uint8Array, start: number, end: number) {
  let length = 0;
  let offset = start;
  for (let index = 0; index < 4 && offset < end; index += 1) {
    const value = bytes[offset++];
    length = (length << 7) | (value & 0x7f);
    if ((value & 0x80) === 0) return { length, dataStart: offset };
  }
  return null;
}

function createBitReader(bytes: Uint8Array) {
  let bitOffset = 0;
  return {
    read(count: number) {
      if (count < 0 || bitOffset + count > bytes.byteLength * 8) {
        throw new AudioInspectionError("Invalid AAC bitstream.");
      }
      let value = 0;
      for (let index = 0; index < count; index += 1) {
        const byte = bytes[Math.floor(bitOffset / 8)];
        value = value * 2 + ((byte >> (7 - (bitOffset % 8))) & 1);
        bitOffset += 1;
      }
      return value;
    },
  };
}

function readSampleTiming(
  bytes: Uint8Array,
  stts: Mp4Box,
  timescale: number,
  sampleRate: number,
) {
  if (stts.dataStart + 8 > stts.end) throw new AudioInspectionError("Invalid stts box.");
  const entryCount = readUint32(bytes, stts.dataStart + 4);
  if (entryCount < 1 || entryCount > MAX_AUDIO_SAMPLES) {
    throw new AudioInspectionError("Invalid audio timing entry count.");
  }
  if (stts.dataStart + 8 + entryCount * 8 > stts.end) {
    throw new AudioInspectionError("Truncated audio timing table.");
  }

  let sampleCount = 0;
  let totalDuration = 0n;
  for (let index = 0; index < entryCount; index += 1) {
    const offset = stts.dataStart + 8 + index * 8;
    const count = readUint32(bytes, offset);
    const delta = readUint32(bytes, offset + 4);
    const samplesPerFrame = (delta * sampleRate) / timescale;
    const fullFrame =
      Math.min(Math.abs(samplesPerFrame - 1024), Math.abs(samplesPerFrame - 960)) <=
      0.01;
    const boundaryPartialFrame =
      count === 1 &&
      (index === 0 || index === entryCount - 1) &&
      samplesPerFrame > 0 &&
      samplesPerFrame < 1024;
    if (
      count < 1 ||
      delta < 1 ||
      (!fullFrame && !boundaryPartialFrame)
    ) {
      throw new AudioInspectionError(`Unexpected AAC sample timing (${count}/${delta}/${samplesPerFrame}).`);
    }
    sampleCount += count;
    if (sampleCount > MAX_AUDIO_SAMPLES) throw new AudioInspectionError("Too many audio samples.");
    totalDuration += BigInt(count) * BigInt(delta);
  }

  return { sampleCount, durationSeconds: Number(totalDuration) / timescale };
}

function readSampleSizes(bytes: Uint8Array, stsz: Mp4Box) {
  if (stsz.dataStart + 12 > stsz.end) throw new AudioInspectionError("Invalid stsz box.");
  const uniformSize = readUint32(bytes, stsz.dataStart + 4);
  const sampleCount = readUint32(bytes, stsz.dataStart + 8);
  if (sampleCount < 1 || sampleCount > MAX_AUDIO_SAMPLES) {
    throw new AudioInspectionError("Invalid audio sample count.");
  }

  if (uniformSize > 0) {
    return { sampleCount, totalBytes: uniformSize * sampleCount };
  }
  if (stsz.dataStart + 12 + sampleCount * 4 > stsz.end) {
    throw new AudioInspectionError("Truncated audio sample-size table.");
  }

  let totalBytes = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const size = readUint32(bytes, stsz.dataStart + 12 + index * 4);
    if (size < 1) throw new AudioInspectionError("Invalid audio sample size.");
    totalBytes += size;
  }
  return { sampleCount, totalBytes };
}

function readUint16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new AudioInspectionError("Unexpected EOF.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    offset,
    false,
  );
}

function readUint32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new AudioInspectionError("Unexpected EOF.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    false,
  );
}

function readUint64(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 8 > bytes.byteLength) throw new AudioInspectionError("Unexpected EOF.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(
    offset,
    false,
  );
}

function readFourCc(bytes: Uint8Array, offset: number, end: number) {
  if (offset < 0 || offset + 4 > end || offset + 4 > bytes.byteLength) {
    throw new AudioInspectionError("Unexpected EOF.");
  }
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}