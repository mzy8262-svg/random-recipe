# -*- coding: utf-8 -*-
"""
随机食谱 · 网页演示版本地服务器
- 托管演示页面（根目录 = 项目根，页面可直接引用 utils/ 下的同一份数据/逻辑）
- /amap/* 反向代理到 https://restapi.amap.com/*（浏览器直连高德会被 CORS 拦截）
"""
import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import ipaddress
import socket
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根 = random-recipe
# 默认监听 0.0.0.0：同 WiFi / 局域网里的朋友可以直接用 http://你的内网IP:8787 打开。
# 只想自己用可设置环境变量 DEMO_HOST=127.0.0.1。
HOST = os.environ.get('DEMO_HOST', '0.0.0.0')
PORT = int(os.environ.get('DEMO_PORT', '8787'))


def client_ip_of(handler):
    """取真实访客 IP：优先 X-Forwarded-For（放在公网反代后面时），否则 TCP 对端地址。"""
    xff = handler.headers.get('X-Forwarded-For', '')
    ip = xff.split(',')[0].strip() if xff else handler.client_address[0]
    try:
        ipaddress.ip_address(ip)
        return ip
    except ValueError:
        return handler.client_address[0]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 演示页/JS 一律不缓存：改完代码“刷新”一定拿到最新版本，避免浏览器用旧缓存
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/amap/'):
            return self.proxy_amap()
        if self.path in ('/', '/index.html'):
            self.path = '/web-demo/index.html'
        return super().do_GET()

    def proxy_amap(self):
        path = self.path[len('/amap/'):]
        # 关键：高德 IP 定位默认看“请求方的出口 IP”。走代理时请求方是服务器，
        # 不把访客 IP 传过去，所有人都会被定到服务器所在城市。
        base = path.split('?')[0]
        if base == 'v3/ip' and 'ip=' not in path:
            cip = client_ip_of(self)
            try:
                if ipaddress.ip_address(cip).is_global:
                    path += ('&' if '?' in path else '?') + 'ip=' + urllib.parse.quote(cip)
            except ValueError:
                pass
        url = 'https://restapi.amap.com/' + path
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'random-recipe-demo'})
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read()
                ctype = r.headers.get('Content-Type', 'application/json; charset=utf-8')
                self.send_response(200)
                self.send_header('Content-Type', ctype)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # 网络不通时返回可读错误
            body = ('{"status":"0","info":"proxy error: %s"}' % str(e)).encode('utf-8')
            self.send_response(502)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write('[demo] %s\n' % (fmt % args))


def lan_ip():
    """探测本机局域网 IP（让同一 WiFi 下的朋友能直接访问）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return ''
    finally:
        s.close()


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((HOST, PORT), Handler) as httpd:
        print('随机食谱演示版已启动（按每个访客自己的设备定位）')
        print('  本机:   http://127.0.0.1:%d' % PORT)
        if HOST != '127.0.0.1':
            ip = lan_ip()
            if ip:
                print('  局域网: http://%s:%d   （同一 WiFi 的朋友用这个地址，会定到他们自己的位置）' % (ip, PORT))
            print('  公网分享: 需要把该端口映射/部署到公网服务器，见 README「发给别人用」')
        httpd.serve_forever()
