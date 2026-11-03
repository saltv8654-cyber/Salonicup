/** Coarse device / OS / browser from a User-Agent string. Good enough for traffic stats, not fingerprinting. */
export function parseUserAgent(ua: string) {
  const s = ua || "";
  const device = /iPad|Tablet|Nexus (7|9|10)|SM-T/i.test(s) ? "Tablet" : /Mobi|iPhone|Android/i.test(s) ? "Κινητό" : s ? "Υπολογιστής" : "Άγνωστο";
  const os =
    /iPhone|iPad|iPod/i.test(s) ? "iOS" :
    /Android/i.test(s) ? "Android" :
    /Windows/i.test(s) ? "Windows" :
    /Mac OS X|Macintosh/i.test(s) ? "macOS" :
    /Linux/i.test(s) ? "Linux" : "Άγνωστο";
  const browser =
    /FBAN|FBAV|FB_IAB/i.test(s) ? "Facebook (εφαρμογή)" :
    /Instagram/i.test(s) ? "Instagram (εφαρμογή)" :
    /TikTok|musical_ly|BytedanceWebview/i.test(s) ? "TikTok (εφαρμογή)" :
    /Viber/i.test(s) ? "Viber (εφαρμογή)" :
    /SamsungBrowser/i.test(s) ? "Samsung Internet" :
    /Edg\//i.test(s) ? "Edge" :
    /OPR\/|Opera/i.test(s) ? "Opera" :
    /Firefox|FxiOS/i.test(s) ? "Firefox" :
    /CriOS|Chrome/i.test(s) ? "Chrome" :
    /Safari/i.test(s) ? "Safari" : "Άλλο";
  return { device, os, browser };
}
