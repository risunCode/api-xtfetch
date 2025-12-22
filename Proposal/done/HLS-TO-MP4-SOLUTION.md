# HLS to MP4 Solution - Client-Side Segment Concatenation

## The Problem
- YouTube API returns HLS stream (m3u8 playlist)
- m3u8 is just a text file listing video segment URLs
- Cannot directly download as MP4

## The Solution
**Client-side segment concatenation** - No FFmpeg needed!

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    HLS m3u8 Playlist                        │
├─────────────────────────────────────────────────────────────┤
│  #EXTM3U                                                    │
│  #EXT-X-VERSION:3                                           │
│  #EXTINF:10.0,                                              │
│  https://cdn.../segment001.ts  ──┐                          │
│  #EXTINF:10.0,                   │                          │
│  https://cdn.../segment002.ts  ──┼── Download all segments  │
│  #EXTINF:10.0,                   │                          │
│  https://cdn.../segment003.ts  ──┘                          │
│  #EXT-X-ENDLIST                                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Concatenate ArrayBuffers                        │
├─────────────────────────────────────────────────────────────┤
│  segment001.ts + segment002.ts + segment003.ts = video.ts   │
│                                                             │
│  const blob = new Blob(segments, { type: 'video/mp2t' });   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Download as MP4                            │
├─────────────────────────────────────────────────────────────┤
│  // .ts files are playable by most players as .mp4          │
│  // H.264 + AAC codec = universal compatibility             │
│                                                             │
│  saveAs(blob, 'video.mp4');  // Works!                      │
└─────────────────────────────────────────────────────────────┘
```

## Implementation

### Step 1: Parse m3u8 Playlist

```typescript
async function parseM3U8(m3u8Url: string): Promise<string[]> {
  // Fetch via proxy to avoid CORS
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(m3u8Url)}&inline=1`);
  const text = await res.text();
  
  // Extract .ts segment URLs
  const lines = text.split('\n');
  const segments: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    // This is a segment URL
    if (trimmed.endsWith('.ts') || trimmed.includes('.ts?')) {
      segments.push(trimmed);
    }
  }
  
  return segments;
}
```

### Step 2: Download All Segments

```typescript
async function downloadSegments(
  segmentUrls: string[],
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer[]> {
  const segments: ArrayBuffer[] = [];
  const total = segmentUrls.length;
  
  for (let i = 0; i < segmentUrls.length; i++) {
    const url = segmentUrls[i];
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    const buffer = await res.arrayBuffer();
    segments.push(buffer);
    
    onProgress?.(i + 1, total);
  }
  
  return segments;
}
```

### Step 3: Concatenate and Download

```typescript
async function downloadHLSAsMP4(
  m3u8Url: string,
  filename: string,
  onProgress?: (percent: number, status: string) => void
): Promise<void> {
  // Step 1: Parse playlist
  onProgress?.(0, 'Parsing playlist...');
  const segmentUrls = await parseM3U8(m3u8Url);
  
  if (segmentUrls.length === 0) {
    throw new Error('No segments found in playlist');
  }
  
  // Step 2: Download segments
  const segments = await downloadSegments(segmentUrls, (loaded, total) => {
    const percent = Math.round((loaded / total) * 90);
    onProgress?.(percent, `Downloading ${loaded}/${total} segments...`);
  });
  
  // Step 3: Concatenate
  onProgress?.(95, 'Merging segments...');
  const totalSize = segments.reduce((acc, buf) => acc + buf.byteLength, 0);
  const merged = new Uint8Array(totalSize);
  
  let offset = 0;
  for (const segment of segments) {
    merged.set(new Uint8Array(segment), offset);
    offset += segment.byteLength;
  }
  
  // Step 4: Create blob and download
  onProgress?.(100, 'Preparing download...');
  const blob = new Blob([merged], { type: 'video/mp4' });
  
  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.mp4') ? filename : `${filename}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

## Proxy Requirements

Add these domains to `ALLOWED_PROXY_DOMAINS`:

```typescript
// YouTube HLS CDN
'googlevideo.com',
'manifest.googlevideo.com',
```

## UI Component

```tsx
function YouTubeDownloadButton({ m3u8Url, title }: Props) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadHLSAsMP4(m3u8Url, title, (percent, status) => {
        setProgress(percent);
        setStatus(status);
      });
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button onClick={handleDownload} disabled={downloading}>
      {downloading ? (
        <>
          <Loader2 className="animate-spin" />
          {status} ({progress}%)
        </>
      ) : (
        <>
          <Download /> Download MP4
        </>
      )}
    </Button>
  );
}
```

## Advantages

✅ **No FFmpeg** - Pure JavaScript  
✅ **No server processing** - All client-side  
✅ **Works on Vercel** - No binary dependencies  
✅ **Progress tracking** - Show download progress  
✅ **Universal playback** - .ts segments are H.264/AAC  

## Limitations

⚠️ **Memory usage** - Full video loaded in browser memory  
⚠️ **Large videos** - May be slow for very long videos (>1 hour)  
⚠️ **CORS** - Need proxy for segment downloads  

## File Size Estimate

| Video Length | Segments (~10s each) | Approx Size |
|--------------|---------------------|-------------|
| 3 min | ~18 segments | ~30-50 MB |
| 10 min | ~60 segments | ~100-150 MB |
| 30 min | ~180 segments | ~300-500 MB |

## Recommendation

- ✅ Good for: Music videos, short clips (< 15 min)
- ⚠️ Caution for: Long videos (> 30 min)
- ❌ Not recommended: Full movies, livestreams

---

*This solution provides MP4 download without any server-side conversion!*
