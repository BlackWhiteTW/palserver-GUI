import { FiX, FiBell } from "react-icons/fi";
import { useAnnouncement } from "./announcement";
import { Markdown } from "./Markdown";
import { card, btn as btnPrimary } from "./ui";

/**
 * 公告彈窗,內容來自 repo 裡的 announcement.md。每則公告(依 id)只顯示一次,
 * 關閉後會記住。載入邏輯見 announcement.ts;內文以共用的 Markdown 元件渲染。
 */
export function AnnouncementPopup() {
  const { announcement, dismiss } = useAnnouncement();
  if (!announcement) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(35_32_48/0.55)] p-6 backdrop-blur-[3px]"
      onClick={dismiss}
    >
      <div className={`${card} w-[460px] max-w-full`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <FiBell className="size-5 text-pal" /> {announcement.title}
          </h2>
          <button className="text-ink-muted transition hover:text-ink" onClick={dismiss} aria-label="關閉">
            <FiX className="size-5" />
          </button>
        </div>
        <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1 text-[13px] leading-relaxed text-ink">
          <Markdown source={announcement.body} />
        </div>
        <div className="mt-4 flex justify-end">
          <button className={btnPrimary} onClick={dismiss}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
