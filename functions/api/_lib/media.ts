export function matchesMediaType(buffer: ArrayBuffer, mime: string) {
  const bytes = new Uint8Array(buffer)
  const ascii = (offset: number, length: number) => new TextDecoder().decode(bytes.slice(offset, offset + length))
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value)
  if (mime === 'image/png') return starts(137, 80, 78, 71, 13, 10, 26, 10)
  if (mime === 'image/jpeg') return starts(255, 216, 255)
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
  if (['audio/wav', 'audio/wave', 'audio/x-wav'].includes(mime)) return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE'
  if (mime === 'audio/flac') return ascii(0, 4) === 'fLaC'
  if (mime.endsWith('/ogg')) return ascii(0, 4) === 'OggS'
  if (mime.endsWith('/webm')) return starts(26, 69, 223, 163)
  if (['audio/mpeg', 'audio/mp3'].includes(mime)) return ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)
  if (mime === 'audio/aac') return bytes[0] === 255 && (bytes[1] & 246) === 240
  if (['video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/mp4', 'audio/x-m4a'].includes(mime)) return bytes.length >= 16 && ascii(4, 4) === 'ftyp'
  return false
}
