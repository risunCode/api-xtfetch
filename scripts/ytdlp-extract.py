#!/usr/bin/env python3
"""
YouTube extractor using yt-dlp
Usage: python ytdlp-extract.py <url>
Output: JSON to stdout
"""
import sys
import json
import yt_dlp

def extract(url: str) -> dict:
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'format': 'best',
        # Don't use browser cookies on server
        # 'cookiesfrombrowser': ('chrome',),
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            formats = []
            seen = set()
            
            for f in info.get('formats', []):
                if not f.get('url'):
                    continue
                
                # Skip duplicates
                fid = f.get('format_id')
                if fid in seen:
                    continue
                seen.add(fid)
                
                vcodec = f.get('vcodec', 'none')
                acodec = f.get('acodec', 'none')
                
                # Determine type
                if vcodec != 'none' and acodec != 'none':
                    ftype = 'video'  # combined video+audio
                elif vcodec != 'none':
                    ftype = 'video'  # video only
                elif acodec != 'none':
                    ftype = 'audio'  # audio only
                else:
                    continue
                
                # Build quality label
                height = f.get('height')
                fps = f.get('fps')
                abr = f.get('abr')
                
                if height:
                    quality = f'{height}p'
                    if fps and fps > 30:
                        quality += f'{fps}'
                elif abr:
                    quality = f'{int(abr)}kbps'
                else:
                    quality = f.get('format_note') or fid
                
                formats.append({
                    'format_id': fid,
                    'quality': quality,
                    'ext': f.get('ext'),
                    'filesize': f.get('filesize') or f.get('filesize_approx'),
                    'url': f.get('url'),
                    'type': ftype,
                    'height': height,
                    'width': f.get('width'),
                    'fps': fps,
                    'vcodec': vcodec if vcodec != 'none' else None,
                    'acodec': acodec if acodec != 'none' else None,
                    'abr': abr,
                })
            
            # Sort: combined first, then by height/quality
            formats.sort(key=lambda x: (
                x['type'] != 'video' or x['acodec'] is None,  # combined first
                -(x.get('height') or 0),
                -(x.get('fps') or 0),
                -(x.get('filesize') or 0)
            ))
            
            return {
                'success': True,
                'data': {
                    'id': info.get('id'),
                    'title': info.get('title'),
                    'description': info.get('description'),
                    'author': info.get('uploader') or info.get('channel'),
                    'duration': info.get('duration'),
                    'thumbnail': info.get('thumbnail'),
                    'view_count': info.get('view_count'),
                    'like_count': info.get('like_count'),
                    'formats': formats
                }
            }
    except yt_dlp.utils.DownloadError as e:
        return {'success': False, 'error': str(e)}
    except Exception as e:
        return {'success': False, 'error': str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'URL required'}))
        sys.exit(1)
    
    url = sys.argv[1]
    result = extract(url)
    print(json.dumps(result))
    
    if not result['success']:
        sys.exit(1)
