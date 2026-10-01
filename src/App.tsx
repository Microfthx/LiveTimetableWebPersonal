import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CloudUpload,
  Home,
  ImageUp,
  Settings2,
  Star,
  Upload,
} from "lucide-react";
import {
  Header,
  NowPlayingCard,
  NextUpCard,
  DelayControl,
  TimetableList,
} from "./components/Cards";
import {
  DelayBottomSheet,
  ImportBottomSheet,
  SettingsSheet,
} from "./components/Sheets";
import { RuntimeImageContext } from "./components/GroupImage";
import { demoData } from "./data/demo";
import { useCurrentTime } from "./hooks/useCurrentTime";
import type { EventData, PosterSource } from "./types/timetable";
import { getCurrentPerformance, getNextPerformance } from "./utils/time";
import { clearEventData, loadEventData, saveEventData } from "./utils/storage";
import {
  cropGroupImages,
  posterRatioDifference,
  readPoster,
  revokeRuntimeImages,
  type RuntimeGroupImages,
} from "./utils/poster";
import {
  deletePosterBlob,
  getPosterBlob,
  savePosterBlob,
} from "./utils/posterStorage";

type OpenSheet = "delay" | "import" | "settings" | null;

export default function App() {
  const [data, setData] = useState<EventData>(loadEventData);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [importMode, setImportMode] = useState<"paste" | "file" | "poster">(
    "paste",
  );
  const [poster, setPoster] = useState<PosterSource | null>(null);
  const posterRef = useRef<PosterSource | null>(null);
  const [runtimeImages, setRuntimeImages] = useState<RuntimeGroupImages>({});
  const runtimeRef = useRef<RuntimeGroupImages>({});
  const assetVersionRef = useRef(0);
  const [notice, setNotice] = useState("");
  const now = useCurrentTime();
  const current = getCurrentPerformance(data, now);
  const next = getNextPerformance(data, now);

  useEffect(
    () => () => {
      revokeRuntimeImages(runtimeRef.current);
      if (posterRef.current) URL.revokeObjectURL(posterRef.current.url);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const version = ++assetVersionRef.current;
    const restoreImages = async () => {
      let source: PosterSource | null = null;
      let images: RuntimeGroupImages = {};
      try {
        const file = await getPosterBlob(data);
        if (!file || !active || version !== assetVersionRef.current) return;
        source = await readPoster(file);
        const result = await cropGroupImages(data, source);
        images = result.images;
        if (!active || version !== assetVersionRef.current) return;
        if (posterRef.current) URL.revokeObjectURL(posterRef.current.url);
        posterRef.current = source;
        setPoster(source);
        source = null;
        revokeRuntimeImages(runtimeRef.current);
        runtimeRef.current = images;
        setRuntimeImages(images);
        images = {};
        if (result.failed.length)
          setNotice(
            `${result.failed.length} 张团体图片恢复失败，请检查海报裁剪区域。`,
          );
      } catch {
        if (active && version === assetVersionRef.current)
          setNotice("已保存活动，但海报图片恢复失败。可重新上传海报。");
      } finally {
        if (source) URL.revokeObjectURL(source.url);
        revokeRuntimeImages(images);
      }
    };
    void restoreImages();
    return () => {
      active = false;
      assetVersionRef.current++;
    };
  }, []);

  const selectPoster = (selected: PosterSource) => {
    assetVersionRef.current++;
    if (posterRef.current) URL.revokeObjectURL(posterRef.current.url);
    posterRef.current = selected;
    setPoster(selected);
  };
  const clearPoster = () => {
    assetVersionRef.current++;
    if (posterRef.current) URL.revokeObjectURL(posterRef.current.url);
    posterRef.current = null;
    setPoster(null);
  };
  const updateDelay = (value: number) => {
    const updated = {
      ...data,
      delay_minutes: Math.max(-1440, Math.min(1440, value)),
    };
    try {
      saveEventData(updated);
      setData(updated);
      setNotice("现场延迟已保存在此浏览器");
    } catch {
      setNotice("保存失败，请检查浏览器存储空间。");
    }
  };
  const importData = async (
    imported: EventData,
    images: RuntimeGroupImages,
  ) => {
    // Commit storage first: a full localStorage must leave the current activity intact.
    saveEventData(imported);
    assetVersionRef.current++;
    const file = posterRef.current?.file;
    let posterSaved = true;
    try {
      if (file) await savePosterBlob(imported, file);
      else await deletePosterBlob();
    } catch {
      posterSaved = false;
    }
    revokeRuntimeImages(runtimeRef.current);
    runtimeRef.current = images;
    setRuntimeImages(images);
    setData(imported);
    clearPoster();
    setNotice(
      posterSaved && file
        ? `已导入 ${imported.event.title}，海报与活动已保存在此浏览器`
        : posterSaved
          ? `已导入 ${imported.event.title}，活动已保存在此浏览器`
          : `已导入 ${imported.event.title}，但海报保存失败；刷新后需重新上传`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const restore = async () => {
    assetVersionRef.current++;
    await deletePosterBlob().catch(() => undefined);
    clearEventData();
    revokeRuntimeImages(runtimeRef.current);
    runtimeRef.current = {};
    setRuntimeImages({});
    clearPoster();
    setData(demoData);
    setNotice("已恢复此浏览器的 Demo 数据");
  };
  const attachCurrentPoster = async (file: File) => {
    let source: PosterSource | null = null;
    let images: RuntimeGroupImages = {};
    try {
      source = await readPoster(file);
      const result = await cropGroupImages(data, source);
      images = result.images;
      if (!Object.keys(images).length)
        throw new Error("没有生成团体图片，请检查海报与裁剪区域。");
      await savePosterBlob(data, file);
      const ratio = posterRatioDifference(data, source);
      assetVersionRef.current++;
      if (posterRef.current) URL.revokeObjectURL(posterRef.current.url);
      posterRef.current = source;
      setPoster(source);
      source = null;
      revokeRuntimeImages(runtimeRef.current);
      runtimeRef.current = images;
      setRuntimeImages(images);
      images = {};
      setNotice(
        ratio !== null && ratio >= 0.05
          ? "图片已恢复并保存；上传海报与 OCR 图片比例不同，请检查裁剪位置。"
          : result.failed.length
            ? `已恢复部分图片，${result.failed.length} 张裁剪失败。`
            : "当前活动图片已恢复并保存在此浏览器",
      );
    } finally {
      if (source) URL.revokeObjectURL(source.url);
      revokeRuntimeImages(images);
    }
  };
  const scrollToTimetable = () =>
    document
      .getElementById("timetable")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const openImport = (mode: "paste" | "file" | "poster") => {
    setImportMode(mode);
    setSheet("import");
  };

  return (
    <RuntimeImageContext.Provider value={runtimeImages}>
      <div className="page-shell">
        <Header data={data} onSettings={() => setSheet("settings")} />
        <main className="page-content">
          <div className="sync-indicator" role="status">
            个人浏览器版 · 数据仅保存在当前浏览器
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check size={16} /> {notice}
              <button onClick={() => setNotice("")} aria-label="关闭提示">
                ×
              </button>
            </div>
          )}
          <NowPlayingCard data={data} now={now} current={current} next={next} />
          <NextUpCard
            data={data}
            now={now}
            current={current}
            next={next}
            onClick={scrollToTimetable}
          />
          <DelayControl
            delay={data.delay_minutes}
            onChange={(delta) => updateDelay(data.delay_minutes + delta)}
            onReset={() => updateDelay(0)}
            onOpen={() => setSheet("delay")}
          />
          <TimetableList data={data} now={now} nextId={next?.id} />
          <section className="import-card" aria-label="导入时间表">
            <div className="import-heading">
              <CloudUpload size={27} />
              <div>
                <h2>导入 Timetable</h2>
                <p>导入活动数据</p>
              </div>
              <Star size={19} className="import-star" />
            </div>
            <div className="import-buttons">
              <button onClick={() => openImport("paste")}>
                <span>
                  <Upload size={19} /> 粘贴 JSON
                </span>
              </button>
              <button onClick={() => openImport("file")}>
                <span>
                  <CloudUpload size={19} /> 上传 JSON
                </span>
              </button>
              <button onClick={() => openImport("poster")}>
                <span>
                  <ImageUp size={19} /> 扫描 / 导入活动海报
                </span>
              </button>
            </div>
            <div className="import-foot">
              <div>
                <span>
                  <Check size={16} /> 活动信息
                </span>
                <span>
                  <Check size={16} /> {data.groups.length} 个团体
                </span>
                <span>
                  <Check size={16} /> {data.groups.length} 个演出时间
                </span>
                <span>
                  <Check size={16} />{" "}
                  {
                    data.groups.filter(
                      (group) => runtimeImages[group.id] || group.image_base64,
                    ).length
                  }{" "}
                  张团体图片
                </span>
              </div>
              <button onClick={() => openImport("paste")}>确认导入</button>
            </div>
          </section>
        </main>
        <nav className="bottom-nav" aria-label="主导航">
          <button
            className="active"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <Home size={22} fill="currentColor" />
            <span>LIVE</span>
          </button>
          <button onClick={scrollToTimetable}>
            <CalendarDays size={22} />
            <span>TIMETABLE</span>
          </button>
          <button onClick={() => setSheet("settings")}>
            <Settings2 size={22} />
            <span>SETTINGS</span>
          </button>
        </nav>
        {sheet === "delay" && (
          <DelayBottomSheet
            delay={data.delay_minutes}
            onApply={updateDelay}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === "import" && (
          <ImportBottomSheet
            mode={importMode}
            poster={poster}
            onPosterSelect={selectPoster}
            onPosterClear={clearPoster}
            onImport={importData}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === "settings" && (
          <SettingsSheet
            data={data}
            onAttachPoster={attachCurrentPoster}
            onRestore={restore}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    </RuntimeImageContext.Provider>
  );
}
