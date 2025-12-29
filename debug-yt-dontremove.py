import subprocess, json

result = subprocess.run(['python', 'scripts/ytdlp-extract.py', 'https://www.youtube.com/watch?v=xetSFt4BuFw'], capture_output=True, text=True)
data = json.loads(result.stdout)['data']

print(f'Duration: {data["duration"]}s')
print()
print('Video formats (720p+):')
for f in data['formats']:
    if f['type'] == 'video' and f.get('height', 0) >= 720:
        size = f.get('filesize', 0)
        tbr = f.get('tbr', 0)
        vcodec = (f.get('vcodec') or '?')[:15]
        print(f"  {f['quality']:10} ext={f['ext']:5} size={size/1024/1024:.1f}MB tbr={tbr:.0f}kbps vcodec={vcodec}")

print()
print('Audio formats:')
for f in data['formats']:
    if f['type'] == 'audio':
        size = f.get('filesize', 0)
        abr = f.get('abr', 0)
        print(f"  {f['quality']:10} ext={f['ext']:5} size={size/1024/1024:.1f}MB abr={abr:.0f}kbps")
