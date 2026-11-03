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

/**
 * Automated visitors: search/link-preview crawlers, uptime checks and headless browsers (e.g. the one Vercel uses
 * for deployment screenshots). Their visits would otherwise show up as real traffic, often from US data centres.
 */
export function isBot(ua: string): boolean {
  return (
    !ua ||
    /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|vercel|prerender|preview|facebookexternalhit|whatsapp|telegrambot|skypeuripreview|bingpreview|python|curl|wget|axios|node-fetch|go-http|java\/|okhttp|phantomjs|puppeteer|playwright|selenium|uptime|monitor|pingdom/i.test(ua)
  );
}
