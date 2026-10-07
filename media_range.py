"""Serve seekable audio without reading the entire recording into memory."""
import re

def serve_media(handler, path, mime):
    stat = path.stat()
    size = stat.st_size
    start, end, partial = 0, size - 1, False
    etag = '"%x-%x"' % (stat.st_mtime_ns, size)
    value = handler.headers.get('Range', '')
    if value and handler.headers.get('If-Range', etag) == etag:
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', value.strip())
        try:
            if not match or not any(match.groups()) or size == 0:
                raise ValueError()
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(size - 1, int(last)) if last else size - 1
            else:
                suffix = int(last)
                if suffix <= 0: raise ValueError()
                start = max(0, size - suffix)
            if start >= size or end < start: raise ValueError()
            partial = True
        except ValueError:
            handler.send_response(416)
            handler.send_header('Content-Range', 'bytes */%d' % size)
            handler.send_header('Content-Length', '0')
            handler.end_headers()
            return
    handler.send_response(206 if partial else 200)
    handler.send_header('Content-Type', mime)
    handler.send_header('Accept-Ranges', 'bytes')
    handler.send_header('ETag', etag)
    handler.send_header('Cache-Control', 'private, no-cache')
    handler.send_header('Content-Length', str(max(0, end-start+1)))
    if partial:
        handler.send_header('Content-Range', 'bytes %d-%d/%d' % (start,end,size))
    handler.end_headers()
    if handler.command == 'HEAD': return
    try:
        with path.open('rb') as stream:
            stream.seek(start)
            remaining = end-start+1
            while remaining > 0:
                chunk = stream.read(min(65536, remaining))
                if not chunk: break
                handler.wfile.write(chunk)
                remaining -= len(chunk)
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        pass
