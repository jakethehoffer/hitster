// Script-tag JSONP request. Both music APIs need it: neither iTunes Search
// nor Deezer sends CORS headers, and JSONP also works from file://.

let jsonpCounter = 0;

export function jsonp(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    jsonpCounter += 1;
    const cbName = `__hitsterJsonp${jsonpCounter}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Search timed out'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Search request failed'));
    };
    script.src = `${url}&callback=${cbName}`;
    document.head.appendChild(script);
  });
}
