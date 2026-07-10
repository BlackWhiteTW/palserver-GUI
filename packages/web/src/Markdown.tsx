import { Fragment, type ReactNode } from "react";

/**
 * 極簡、零相依的 markdown 渲染器,涵蓋公告與教學會用到的語法:標題、粗體/斜體/
 * 行內程式碼、連結、無序/有序清單、blockquote、分隔線與段落,以及圖片與
 * YouTube/影片嵌入。內容雖來自我們自己的 repo,仍一律建成 React 節點
 * (不用 dangerouslySetInnerHTML),避免注入原始 HTML。
 */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 分隔線
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-3 border-line" />);
      i++;
      continue;
    }

    // blockquote(> 開頭,合併連續行)
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="my-2 border-l-4 border-pal/40 bg-card-soft/60 py-1.5 pl-3 text-ink-muted">
          {inline(quoted.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // 單獨成行的媒體:YouTube 連結/嵌入、影片或圖片的裸 URL、或圖片語法,
    // 一律以區塊層級的嵌入呈現。
    const media = blockMedia(line.trim());
    if (media) {
      blocks.push(<Fragment key={key++}>{media}</Fragment>);
      i++;
      continue;
    }

    // 標題
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level <= 1 ? "text-base font-extrabold" : level === 2 ? "text-sm font-extrabold" : "text-sm font-bold";
      blocks.push(
        <p key={key++} className={`mt-3 mb-1 ${cls}`}>
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }

    // 清單(合併同類項)
    const isUl = /^\s*[-*+]\s+/.test(line);
    const isOl = /^\s*\d+\.\s+/.test(line);
    if (isUl || isOl) {
      const items: ReactNode[] = [];
      while (i < lines.length && (isUl ? /^\s*[-*+]\s+/ : /^\s*\d+\.\s+/).test(lines[i])) {
        const text = lines[i].replace(isUl ? /^\s*[-*+]\s+/ : /^\s*\d+\.\s+/, "");
        items.push(<li key={items.length}>{inline(text)}</li>);
        i++;
      }
      blocks.push(
        isUl ? (
          <ul key={key++} className="my-2 list-disc space-y-1 pl-5">
            {items}
          </ul>
        ) : (
          <ol key={key++} className="my-2 list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ),
      );
      continue;
    }

    // 段落(吃掉連續、非空白且非結構性的行)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2">
        {inline(para.join(" "))}
      </p>,
    );
  }

  return <>{blocks}</>;
}

/** 從常見的 YouTube 網址格式抽出影片 id,取不到則回傳 null。 */
function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
}

const IMG_URL = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;
const VIDEO_URL = /\.(mp4|webm|ogg)(\?.*)?$/i;

/**
 * 若整行只有單一媒體參照,渲染成區塊嵌入:YouTube 連結(裸 URL、`[text](yt)`
 * 或 `![alt](yt)`)會變成響應式 iframe;圖片語法或圖片裸 URL 變成 <img>;
 * 影片 URL 變成 <video>。若該行不是單獨媒體則回傳 null。
 */
function blockMedia(line: string): ReactNode {
  // ![alt](url) 或 [text](url)
  const link = line.match(/^!?\[([^\]]*)\]\(([^)]+)\)$/);
  const alt = link ? link[1] : "";
  const isImageSyntax = line.startsWith("!");
  const url = link ? link[2] : line;

  // 裸字串檢查 — 只有整行剛好是單一 URL/參照時才當作媒體
  if (!link && /\s/.test(line)) return null;
  if (!/^https?:\/\//i.test(url) && !link) return null;

  const yt = youtubeId(url);
  if (yt) {
    return (
      <div className="my-3 aspect-video w-full overflow-hidden rounded-xl border-2 border-line">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${yt}`}
          title={alt || "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (VIDEO_URL.test(url)) {
    return <video className="my-3 w-full rounded-xl border-2 border-line" src={url} controls />;
  }
  if (isImageSyntax || IMG_URL.test(url)) {
    return (
      <img src={url} alt={alt} className="my-3 w-full rounded-xl border-2 border-line" loading="lazy" />
    );
  }
  return null;
}

/** 行內格式:圖片、`程式碼`、**粗體**、*斜體*,以及 [文字](網址) 連結。 */
function inline(text: string): ReactNode {
  const tokens: ReactNode[] = [];
  // 順序有意義:圖片、連結、程式碼、粗體、斜體。
  const re = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      tokens.push(
        <img key={k++} src={m[2]} alt={m[1]} className="my-1 inline-block max-h-40 rounded-lg align-middle" loading="lazy" />,
      );
    } else if (m[3] !== undefined) {
      const href = m[4];
      const safe = /^(https?:|mailto:)/i.test(href) ? href : "#";
      tokens.push(
        <a key={k++} href={safe} target="_blank" rel="noreferrer" className="font-bold text-pal underline">
          {m[3]}
        </a>,
      );
    } else if (m[5] !== undefined) {
      tokens.push(
        <code key={k++} className="rounded bg-card-soft px-1 py-0.5 font-mono text-xs">
          {m[5]}
        </code>,
      );
    } else if (m[6] !== undefined) {
      tokens.push(<b key={k++}>{m[6]}</b>);
    } else if (m[7] !== undefined) {
      tokens.push(<i key={k++}>{m[7]}</i>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return tokens;
}
