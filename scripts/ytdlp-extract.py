#!/usr/bin/env python3
"""
YouTube extractor using yt-dlp
Usage: python ytdlp-extract.py <url> [cookie_file]
Output: JSON to stdout

Cookie file can be:
- Netscape format cookie file (cookies.txt)
- JSON array from browser extension (EditThisCookie, etc.)
"""
import sys
import json
import os
import tempfile
import yt_dlp

def parse_json_cookies_to_netscape(json_cookies: list) -> str:
    """Convert JSON cookie array to Netscape format"""
    lines = ["# Netscape HTTP Cookie File"]
    for c in json_cookies:
        domain = c.get('domain', '')
        # Ensure domain starts with dot for subdomains
        if domain and not domain.startswith('.'):
            domain = '.' + domain
        flag = 'TRUE' if domain.startswith('.') else 'FALSE'
        path = c.get('path', '/')
        secure = 'TRUE' if c.get('secure', False) else 'FALSE'
        expires = str(int(c.get('expirationDate', 0)))
        name = c.get('name', '')
        value = c.get('value', '')
        if name and value:
            lines.append(f"{domain}\t{flag}\t{path}\t{secure}\t{expires}\t{name}\t{value}")
    return '\n'.join(lines)

def extract(url: str, cookie_file: str = None) -> dict:
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'format': 'best',
    }
    
    temp_cookie_file = None
    
    # Handle cookie file
    if cookie_file and os.path.exists(cookie_file):
        try:
            with open(cookie_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            # Check if it's JSON format (from browser extension)
            if content.startswith('['):
                json_cookies = json.loads(content)
                # Filter to YouTube/Google cookies only
                yt_cookies = [c for c in json_cookies if any(d in c.get('domain', '') for d in ['youtube.com', 'google.com'])]
                if yt_cookies:
                    netscape_content = parse_json_cookies_to_netscape(yt_cookies)
                    # Write to temp file
                    temp_cookie_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
                    temp_cookie_file.write(netscape_content)
                    temp_cookie_file.close()
                    ydl_opts['cookiefile'] = temp_cookie_file.name
            else:
                # Assume Netscape format
                ydl_opts['cookiefile'] = cookie_file
        except Exception as e:
            # Cookie parsing failed, continue without cookies
            pass
    
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
    finally:
        # Cleanup temp cookie file
        if temp_cookie_file and os.path.exists(temp_cookie_file.name):
            try:
                os.unlink(temp_cookie_file.name)
            except:
                pass

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'URL required'}))
        sys.exit(1)
    
    url = sys.argv[1]
    cookie_file = sys.argv[2] if len(sys.argv) > 2 else None
    result = extract(url, cookie_file)
    print(json.dumps(result))
    
    if not result['success']:
        sys.exit(1)
