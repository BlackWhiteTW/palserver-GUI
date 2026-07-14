/** 把舊 workers.dev 網址的所有請求原樣轉發到新端點(方法、標頭、body 不動)。 */
const TARGET = "https://stats.iosoftware.ai";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const target = new URL(url.pathname + url.search, TARGET);
    return fetch(new Request(target, req));
  },
} satisfies ExportedHandler;
