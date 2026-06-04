const PROXY_IMAGE_HOSTS = [
  'xhscdn.com',
  'xhscdn.net',
  'xiaohongshu.com',
  'finder.video.qq.com',
  'video.qq.com',
  'wx.qlogo.cn',
  'qpic.cn'
];

export function getMediaUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const shouldProxy = PROXY_IMAGE_HOSTS.some((host) => (
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    ));
    return shouldProxy ? `/api/proxy/image?url=${encodeURIComponent(url)}` : url;
  } catch (error) {
    return url;
  }
}

export function getAvatarUrl(url) {
  return getMediaUrl(url);
}
