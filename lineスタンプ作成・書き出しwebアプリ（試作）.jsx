import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Download, ImagePlus, Image as ImageIcon, Trash2, CheckCircle2, Sparkles, Wand2, Bug } from "lucide-react";

/**
 * LINE Sticker Maker (static stickers) — single-file React component
 * v2: "オールおまかせ" 文字スタンプ生成モードを追加
 * - 画像から作る（v1）
 * - テーマ＆挨拶から自動レイアウトして作る（NEW）
 *
 * ▲ Fix: 正規表現の未終端エラーを修正（customTexts.split(/\n|,|，|、/)）
 * ▲ Add: 簡易テストパネル（split/偶数px/描画サイズ）
 */

const MAX_STICKERS = 40;
const STICKER_W = 370;
const STICKER_H = 320;
const MAIN_W = 240;
const MAIN_H = 240;
const TAB_W = 96;
const TAB_H = 74;

function even(n:number){
  return n % 2 === 0 ? n : n - 1; // LINE要件: 偶数ピクセル
}

function drawContainToCanvas(
  img: HTMLImageElement | ImageBitmap,
  targetW: number,
  targetH: number,
  bgAlpha = 0,
  padding = 0
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = even(targetW);
  canvas.height = even(targetH);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // 背景（透明 or 半透明）
  if (bgAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${bgAlpha})`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  const innerW = canvas.width - padding*2;
  const innerH = canvas.height - padding*2;
  const imgW = (img as any).width;
  const imgH = (img as any).height;
  const scale = Math.min(innerW / imgW, innerH / imgH);
  const drawW = Math.round(imgW * scale);
  const drawH = Math.round(imgH * scale);
  const dx = Math.round((canvas.width - drawW)/2);
  const dy = Math.round((canvas.height - drawH)/2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img as any, dx, dy, drawW, drawH);
  return canvas;
}

function dataURLtoFile(dataUrl: string, filename: string) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

// —— NEW: テキストスタンプ生成ヘルパー ——
const JP_FONTS = [
  { key:"noto", label:"Noto Sans JP (標準)" },
  { key:"bizen", label:"UD明朝 / 風 (代替)" },
  { key:"maru", label:"丸ゴシック風" },
];

const PRESETS: Record<string,string[]> = {
  greet: ["おはよう！","こんにちは！","こんばんは！","おつかれさま！","ありがとう！","よろしく！","了解！","ごめん！","おめでとう！","行ってきます","ただいま","またね！","助かる！","お願いします！","すぐ行きます","OK！","NG…","最高！","草","既読スルー許して"],
  polite: ["ありがとうございます","よろしくお願いいたします","承知しました","確認します","かしこまりました","ご連絡お待ちしております","お手数ですが","失礼します","お大事に","引き続きよろしく"],
  kansai: ["まいど！","ほな！","ええやん","知らんけど","助かったで！","ほんまそれ","しばし待たれい","めっちゃ好き","よっしゃ！","かなんわ〜"],
  season: ["新年おめでとう","花見いこ！","暑すぎ！","台風気をつけて","ハロウィンやで","メリークリスマス","良いお年を","年度末がんばろ","花粉つらい","衣替え完了！"],
};

function wrapLines(ctx:CanvasRenderingContext2D, text:string, maxWidth:number){
  const words = [...text]; // 1文字ずつ
  const lines:string[] = [];
  let line = "";
  for (const w of words){
    const test = line + w;
    if (ctx.measureText(test).width > maxWidth && line !== ""){
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if(line) lines.push(line);
  return lines;
}

function drawTextSticker({
  text,
  theme = "",
  w = STICKER_W,
  h = STICKER_H,
  fontKey = "noto",
  padding = 12,
  stroke = true,
  shadow = true,
  emojiLead = true,
}: {
  text: string; theme?: string; w?: number; h?: number; fontKey?: string; padding?: number; stroke?: boolean; shadow?: boolean; emojiLead?: boolean;
}){
  const canvas = document.createElement("canvas");
  canvas.width = even(w); canvas.height = even(h);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,w,h);

  // 透明背景。テキストのみ描画
  const safeW = w - padding*2;
  const safeH = h - padding*2;

  // 絵文字やテーマの装飾
  const themeEmoji = emojiLead && theme ? `${pickEmoji(theme)} ` : "";
  const message = `${themeEmoji}${text}`.trim();

  // 自動フォントサイズ決定
  let size = 120; // 初期大きめ → 減らしていく
  const fontFamily = fontKey === "maru" ? "system-ui, -apple-system, \"Hiragino Maru Gothic Pro\", \"Yu Gothic UI\", \"Noto Sans JP\", sans-serif"
    : fontKey === "bizen" ? "\"Yu Mincho\", \"Hiragino Mincho ProN\", serif" : "\"Noto Sans JP\", \"Yu Gothic\", system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  while(size > 12){
    ctx.font = `bold ${size}px ${fontFamily}`;
    const lines = wrapLines(ctx, message, safeW);
    const lineHeight = Math.round(size * 1.1);
    const totalH = lines.length * lineHeight;
    const fits = totalH <= safeH && Math.max(...lines.map(l=>ctx.measureText(l).width)) <= safeW;
    if(fits){ break; }
    size -= 2;
  }

  ctx.font = `bold ${size}px ${fontFamily}`;
  const lines = wrapLines(ctx, message, safeW);
  const lineHeight = Math.round(size * 1.1);
  const startY = Math.round((h - lineHeight*lines.length)/2 + lineHeight/2);

  // 影 & フチ
  if (shadow){
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = Math.max(4, Math.round(size*0.08));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(2, Math.round(size*0.05));
  }
  if (stroke){
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(6, Math.round(size*0.12));
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
  }

  // 塗り（白→黄→赤の縦グラデ）
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.6, "#ffe28a");
  grad.addColorStop(1, "#ff6b6b");
  ctx.fillStyle = grad;

  lines.forEach((l, idx)=>{
    const y = startY + idx*lineHeight;
    if(stroke) ctx.strokeText(l, Math.round(w/2), y);
    ctx.fillText(l, Math.round(w/2), y);
  });

  // 影を次描画に影響させない
  ctx.shadowColor = "transparent";
  return canvas;
}

function pickEmoji(theme:string){
  const t = theme.toLowerCase();
  if(/(朝|おは|morning)/.test(t)) return "🌅";
  if(/(昼|こんにちは|noon|day)/.test(t)) return "🌞";
  if(/(夜|こんばんは|night)/.test(t)) return "🌙";
  if(/(ありがとう|thanks|感謝)/.test(t)) return "🙏";
  if(/(おめ|祝|congrats)/.test(t)) return "🎉";
  if(/(季節|春|花見|sakura)/.test(t)) return "🌸";
  if(/(夏|暑)/.test(t)) return "🌊";
  if(/(秋|紅葉)/.test(t)) return "🍁";
  if(/(冬|雪|xmas|クリスマス)/.test(t)) return "❄️";
  if(/(仕事|ビジネス|ok|了解|承知)/.test(t)) return "📌";
  return "✨";
}

function setupPWA(){
  // Create a minimal manifest at runtime (works for quick PWA trials)
  const makeIcon = (size:number)=>{
    const c = document.createElement('canvas'); c.width=size; c.height=size; const ctx=c.getContext('2d')!;
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle='#ff84c9';
    // heart-ish bubble
    ctx.beginPath();
    const r=size*0.18, cx=size*0.35, cy=size*0.35, cx2=size*0.65, cy2=size*0.35;
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.arc(cx2, cy2, r, Math.PI, 0);
    ctx.lineTo(size*0.80, size*0.62);
    ctx.quadraticCurveTo(size*0.50, size*0.95, size*0.20, size*0.62);
    ctx.closePath(); ctx.fill();
    // Kawaii text dot
    ctx.fillStyle='#7a3b5a';
    ctx.beginPath(); ctx.arc(size*0.52,size*0.53,size*0.03,0,Math.PI*2); ctx.fill();
    return c.toDataURL('image/png');
  };
  const manifest:any = {
    name: 'LINE Sticker Maker (Kawaii)', short_name:'Stickers', start_url: '.', scope: '.',
    display:'standalone', theme_color:'#ff84c9', background_color:'#ffffff',
    icons:[
      {src: makeIcon(192), sizes:'192x192', type:'image/png'},
      {src: makeIcon(512), sizes:'512x512', type:'image/png'}
    ]
  };
  const mblob = new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});
  const murl = URL.createObjectURL(mblob);
  let link = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
  if(!link){ link = document.createElement('link'); link.rel='manifest'; document.head.appendChild(link); }
  link.href = murl;
  // theme-color
  let meta = document.querySelector("meta[name='theme-color']") as HTMLMetaElement | null;
  if(!meta){ meta = document.createElement('meta'); meta.name='theme-color'; document.head.appendChild(meta); }
  meta.content = '#ff84c9';

  // Simple offline-first service worker (runtime blob)
  if('serviceWorker' in navigator){
    const swCode = `
      const CACHE = 'kawaii-stickers-v1';
      const CORE = [ './' ];
      self.addEventListener('install', e => {
        e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(()=>self.skipWaiting()));
      });
      self.addEventListener('activate', e => {
        e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE && caches.delete(k)))).then(()=>self.clients.claim()));
      });
      self.addEventListener('fetch', e => {
        const req = e.request;
        if(req.method !== 'GET') return;
        e.respondWith(
          caches.match(req).then(hit => hit || fetch(req).then(res => {
            const copy = res.clone();
            caches.open(CACHE).then(c => { try { c.put(req, copy); } catch(_){} });
            return res;
          }).catch(()=> caches.match('./') ))
        );
      });`;
    const blob = new Blob([swCode], {type:'text/javascript'});
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl, {scope:'./'})
      .then(()=>console.log('SW registered'))
      .catch(err=>console.error('SW failed', err));
  }
}

$1
  const [mode, setMode] = useState<"image"|"auto">("auto");

  // 画像モード
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [count, setCount] = useState<8 | 16 | 24 | 32 | 40>(8);
  const [padding, setPadding] = useState<number>(10); // 最大画像の周囲パディング(px)
  const [bgAlpha, setBgAlpha] = useState<number>(0); // 透明背景（0）推奨
  const [mainIndex, setMainIndex] = useState<number>(0);
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [trimToEven, setTrimToEven] = useState(true);

  // おまかせモード
  const [theme, setTheme] = useState<string>("かわいい挨拶");
  const [preset, setPreset] = useState<string>("greet");
  const [customTexts, setCustomTexts] = useState<string>("");
  const [fontKey, setFontKey] = useState<string>("maru");
  const [emojiLead, setEmojiLead] = useState<boolean>(true);
  const [stroke, setStroke] = useState<boolean>(true);
  const [shadow, setShadow] = useState<boolean>(true);
  const [styleKey, setStyleKey] = useState<string>("kawaii");
  const [bubble, setBubble] = useState<boolean>(true);

  // —— 簡易テスト（UI から実行） ——
  const [testResults, setTestResults] = useState<string[]>([]);
  function runSelfTests(){
    const results:string[] = [];
    // TC1: 分割（\n, ",", "，", "、"）
    const tc1 = "A\nB,C，D、E";
    const split1 = tc1.split(/\n|,|，|、/).map(s=>s.trim()).filter(Boolean);
    results.push(`TC1 split => ${JSON.stringify(split1)}`);

    // TC2: even()
    results.push(`TC2 even(371) => ${even(371)}, even(370) => ${even(370)}`);

    // TC3: 描画サイズ
    const c = drawTextSticker({ text: "テスト", theme: "朝", w: STICKER_W, h: STICKER_H });
    results.push(`TC3 canvas ${c.width}x${c.height}`);

    setTestResults(results);
    const ok = (split1.length===5) && even(371)===370 && c.width===STICKER_W && c.height===STICKER_H;
    ok ? toast.success("Self tests passed") : toast.error("Self tests found issues");
  }

  const disabled = images.length === 0;

  const onPick = () => inputRef.current?.click();

  const onFiles = async (list: FileList | null) => {
    if(!list) return;
    const arr = Array.from(list).slice(0, MAX_STICKERS);
    const valid = arr.filter(f => /image\/(png|jpeg|webp)/i.test(f.type));
    if(valid.length === 0){
      toast.error("PNG/JPG/WebPの画像を選んでください");
      return;
    }
    setFiles(valid);
    const urls = await Promise.all(valid.map(f => new Promise<string>(res => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(f);
    })));
    setImages(urls);
    setMainIndex(0);
    setTabIndex(0);
  };

  const removeAt = (i:number) => {
    const nextF = files.slice();
    const nextI = images.slice();
    nextF.splice(i,1);
    nextI.splice(i,1);
    setFiles(nextF);
    setImages(nextI);
    if(mainIndex >= nextI.length) setMainIndex(0);
    if(tabIndex >= nextI.length) setTabIndex(0);
  };

  const makePNG = (canvas: HTMLCanvasElement) => canvas.toDataURL("image/png");

  async function exportZIPFromImages(){
    if(images.length === 0){ toast.error("画像を追加してください"); return; }
    setExporting(true); setProgress(0);
    try{
      const zip = new JSZip();
      zip.file("README.txt",
`Exported by LINE Sticker Maker (web)

Specs (static):
- Sticker: up to ${STICKER_W}x${STICKER_H}px (even), PNG, <=1MB
- Main: ${MAIN_W}x${MAIN_H}px
- Tab: ${TAB_W}x${TAB_H}px
- Background: transparent
`);

      const used = images.slice(0, count);
      for (let i=0; i<used.length; i++){
        setProgress(Math.round((i/used.length)*70));
        const url = used[i];
        const img = await createImageBitmap(await (await fetch(url)).blob());
        const c = drawContainToCanvas(img, STICKER_W, STICKER_H, bgAlpha, padding);
        if(trimToEven){ c.width = even(c.width); c.height = even(c.height); }
        const data = makePNG(c);
        const file = dataURLtoFile(data, `${String(i+1).padStart(2,'0')}.png`);
        if(file.size > 1024*1024){ toast.warning(`${file.name} が1MB超（${(file.size/1024).toFixed(0)}KB）`); }
        zip.file(`${String(i+1).padStart(2,'0')}.png`, file);
      }
      // main.png
      setProgress(80);
      {
        const src = images[mainIndex];
        const img = await createImageBitmap(await (await fetch(src)).blob());
        const c = drawContainToCanvas(img, MAIN_W, MAIN_H, bgAlpha, Math.round(padding*MAIN_W/STICKER_W));
        zip.file(`main.png`, dataURLtoFile(makePNG(c), `main.png`));
      }
      // tab.png
      setProgress(90);
      {
        const src = images[tabIndex];
        const img = await createImageBitmap(await (await fetch(src)).blob());
        const c = drawContainToCanvas(img, TAB_W, TAB_H, bgAlpha, Math.round(padding*TAB_W/STICKER_W));
        zip.file(`tab.png`, dataURLtoFile(makePNG(c), `tab.png`));
      }
      setProgress(95);
      const blob = await zip.generateAsync({type: "blob"});
      saveAs(blob, `line-stickers-${count}.zip`);
      setProgress(100);
      toast.success("ZIPを書き出しました！");
    }catch(e){ console.error(e); toast.error("書き出しでエラー"); }
    finally{ setExporting(false); }
  }

  async function exportZIPFromTexts(){
    // 生成テキスト
    const base = PRESETS[preset] || [];
    // ★ FIX: 正規表現の未終端を修正（改行/カンマ/J全角カンマ/読点で分割）
    const extra = customTexts.split(/\n|,|，|、/).map(s=>s.trim()).filter(Boolean);
    const all = (base.concat(extra)).slice(0, count);
    if(all.length === 0){ toast.error("テキストがありません"); return; }

    setExporting(true); setProgress(0);
    try{
      const zip = new JSZip();
      zip.file("README.txt",
`Exported by LINE Sticker Maker (Auto-Text)
Theme: ${theme}
Font: ${fontKey}
Style: ${styleKey} (bubble:${bubble})
`);

      for(let i=0;i<all.length;i++){
        setProgress(Math.round((i/all.length)*70));
        const c = drawTextSticker({ text: all[i], theme, w: STICKER_W, h: STICKER_H, fontKey, padding: 16, stroke, shadow, emojiLead, styleKey, bubble });
        const file = dataURLtoFile(makePNG(c), `${String(i+1).padStart(2,'0')}.png`);
        if(file.size > 1024*1024){ toast.warning(`${file.name} が1MB超（${(file.size/1024).toFixed(0)}KB）`); }
        zip.file(`${String(i+1).padStart(2,'0')}.png`, file);
      }

      // main.png/tab.png は先頭の文言で
      setProgress(80);
      {
        const c = drawTextSticker({ text: all[0] || "MAIN", theme, w: MAIN_W, h: MAIN_H, fontKey, padding: 10, stroke, shadow, emojiLead, styleKey, bubble });
        zip.file("main.png", dataURLtoFile(makePNG(c), "main.png"));
      }
      setProgress(90);
      {
        const c = drawTextSticker({ text: all[0] || "TAB", theme, w: TAB_W, h: TAB_H, fontKey, padding: 6, stroke, shadow, emojiLead, styleKey, bubble });
        zip.file("tab.png", dataURLtoFile(makePNG(c), "tab.png"));
      }

      const blob = await zip.generateAsync({type: "blob"});
      saveAs(blob, `line-stickers-auto-${all.length}.zip`);
      setProgress(100);
      toast.success("おまかせスタンプを書き出しました！");
    } catch(e){ console.error(e); toast.error("書き出しでエラー"); }
    finally{ setExporting(false); setProgress(0); }
  }

  // Ensure PWA is prepared once in auto mode mount
React.useEffect(()=>{ setupPWA(); }, []);

$1min-h-screen w-full bg-gradient-to-b from-white to-pink-50 p-4 md:p-8">
      <motion.h1 initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
        LINEスタンプ作成アプリ（静止画）
      </motion.h1>
      <p className="text-slate-600 mb-6 max-w-3xl">
        画像から作る／テーマと挨拶だけで自動生成の2モード。規定サイズ（370×320px／PNG透過）でZIP出力、メイン（240×240）・タブ（96×74）も同梱。
      </p>

      <Tabs defaultValue={mode} className="mb-4" onValueChange={(v)=>setMode(v as any)}>
        <TabsList>
          <TabsTrigger value="image"><ImageIcon className="h-4 w-4 mr-1"/>画像から</TabsTrigger>
          <TabsTrigger value="auto">💖 オールおまかせ（かわいい）</TabsTrigger>
        $1<div className="ml-2 hidden md:flex items-center gap-2">
  <Button size="sm" variant="outline" onClick={()=>{ setupPWA(); toast.success('PWA準備完了：ホーム画面に追加できます'); }}>📲 PWA準備</Button>
</div>
{/* 画像モード */}
        <TabsContent value="image" className="mt-4">
          <Card className="mb-6">
            <CardContent className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row gap-4 md:items-end">
                <div className="flex-1">
                  <label className="text-sm text-slate-600">画像ファイル（最大{MAX_STICKERS}枚、PNG/JPG/WebP）</label>
                  <div className="mt-2 flex gap-2">
                    <Input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e)=>onFiles(e.target.files)} />
                    <Button onClick={onPick} variant="default"><ImagePlus className="mr-2 h-4 w-4"/>画像を選ぶ</Button>
                    <Button variant="secondary" onClick={()=>{ setFiles([]); setImages([]); }}>クリア</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[8,16,24,32,40].map(n=> (
                    <Button key={n} variant={count===n?"default":"outline"} onClick={()=>setCount(n as any)}>
                      {n}枚セット
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm mb-2">パディング（余白）: {padding}px</div>
                  <Slider value={[padding]} min={0} max={30} step={1} onValueChange={(v)=>setPadding(v[0])} />
                </div>
                <div>
                  <div className="text-sm mb-2">背景の不透明度（0=透過推奨）: {bgAlpha}</div>
                  <Slider value={[bgAlpha]} min={0} max={1} step={0.05} onValueChange={(v)=>setBgAlpha(v[0])} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="even" checked={trimToEven} onCheckedChange={(c)=>setTrimToEven(Boolean(c))} />
                  <label htmlFor="even" className="text-sm">偶数ピクセルで書き出す（LINE要件）</label>
                </div>
              </div>

              {exporting && (
                <div className="mt-6">
                  <Progress value={progress} />
                  <div className="text-xs text-slate-500 mt-2">書き出し中… {progress}%</div>
                </div>
              )}
            </CardContent>
          </Card>

          {images.length === 0 ? (
            <div className="border border-dashed rounded-2xl p-10 text-center text-slate-500">
              画像を追加するとプレビューが表示されます。
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
              {images.map((src, i)=> (
                <div key={i} className="relative group">
                  <img src={src} alt={`src-${i}`} className="w-full h-36 object-cover rounded-xl border" />
                  <div className="absolute top-2 left-2">
                    {i===mainIndex && <Badge className="mr-1" variant="default">MAIN</Badge>}
                    {i===tabIndex && <Badge variant="secondary">TAB</Badge>}
                  </div>
                  <Button size="icon" variant="destructive" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition" onClick={()=>removeAt(i)}>
                    <Trash2 className="h-4 w-4"/>
                  </Button>
                  <div className="absolute bottom-2 left-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={()=>setMainIndex(i)}>メイン</Button>
                    <Button size="sm" variant="outline" onClick={()=>setTabIndex(i)}>タブ</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={exportZIPFromImages} disabled={images.length===0 || exporting}><Download className="mr-2 h-4 w-4"/>ZIPに書き出す</Button>
            <div className="text-slate-500 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4"/> PNG透過・偶数px・1MB上限のチェック
            </div>
          </div>
        </TabsContent>

        {/* おまかせモード */}
        <TabsContent value="auto" className="mt-4">
          <Card className="mb-4">
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="grid md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">テーマ</label>
                  <Input value={theme} onChange={e=>setTheme(e.target.value)} placeholder="例：朝の挨拶／秋／ビジネス連絡" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">プリセット</label>
                  <Select value={preset} onValueChange={setPreset}>
                    <SelectTrigger><SelectValue placeholder="選択"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greet">基本の挨拶</SelectItem>
                      <SelectItem value="polite">ていねい・ビジネス</SelectItem>
                      <SelectItem value="kansai">関西ことば</SelectItem>
                      <SelectItem value="season">季節ネタ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">フォント</label>
                  <Select value={fontKey} onValueChange={setFontKey}>
                    <SelectTrigger><SelectValue placeholder="フォント"/></SelectTrigger>
                    <SelectContent>
                      {JP_FONTS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">スタイル</label>
                  <Select value={styleKey} onValueChange={setStyleKey}>
                    <SelectTrigger><SelectValue placeholder="スタイル"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kawaii">かわいい（パステル／丸フチ）</SelectItem>
                      <SelectItem value="pop">ポップ（カラフル強め）</SelectItem>
                      <SelectItem value="calm">おだやか（低彩度）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-600">セット枚数</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[8,16,24,32,40].map(n=> (
                      <Button key={n} variant={count===n?"default":"outline"} onClick={()=>setCount(n as any)}>{n}</Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-6">
                  <Checkbox id="emoji" checked={emojiLead} onCheckedChange={(c)=>setEmojiLead(Boolean(c))} />
                  <label htmlFor="emoji" className="text-sm">テーマ絵文字を自動付与</label>
                  <Checkbox id="stroke" checked={stroke} onCheckedChange={(c)=>setStroke(Boolean(c))} />
                  <label htmlFor="stroke" className="text-sm">太フチ</label>
                  <Checkbox id="shadow" checked={shadow} onCheckedChange={(c)=>setShadow(Boolean(c))} />
                  <label htmlFor="shadow" className="text-sm">影</label>
                  <Checkbox id="bubble" checked={bubble} onCheckedChange={(c)=>setBubble(Boolean(c))} />
                  <label htmlFor="bubble" className="text-sm">かわいいバブル背景</label>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm text-slate-600">追加フレーズ（改行 or カンマ区切り）</label>
                  <Textarea rows={3} value={customTexts} onChange={e=>setCustomTexts(e.target.value)} placeholder={"例）\nおやすみ\n今向かってます\n会議入ります"} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={exportZIPFromTexts} disabled={exporting}>💝 おまかせ生成→ZIP</Button>
                {exporting && (<><Progress value={progress} className="w-40" /><span className="text-xs text-slate-500">生成中… {progress}%</span></>)}
              </div>

              <p className="text-xs text-slate-500">※ 背景は透明のまま、必要に応じて淡いバブルを描画します。1MB超は警告。main.png/tab.png は先頭のフレーズから自動生成。</p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-6">
            <PreviewText title="スタンプ（370×320）サンプル" w={STICKER_W} h={STICKER_H} text={(PRESETS[preset]?.[0]||"サンプル") + ""} theme={theme} fontKey={fontKey} emojiLead={emojiLead} stroke={stroke} shadow={shadow} styleKey={styleKey} bubble={bubble} />
            <PreviewText title="メイン（240×240）" w={MAIN_W} h={MAIN_H} text={(PRESETS[preset]?.[0]||"MAIN")} theme={theme} fontKey={fontKey} emojiLead={emojiLead} stroke={stroke} shadow={shadow} styleKey={styleKey} bubble={bubble} />
            <PreviewText title="タブ（96×74）" w={TAB_W} h={TAB_H} text={(PRESETS[preset]?.[0]||"TAB")} theme={theme} fontKey={fontKey} emojiLead={emojiLead} stroke={stroke} shadow={shadow} styleKey={styleKey} bubble={bubble} />
          </div>

          {/* —— Debug/Test パネル —— */}
          <Card className="mt-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <Bug className="h-4 w-4"/>
                <div className="font-medium">Self Tests</div>
                <Button size="sm" variant="outline" onClick={runSelfTests}>Run tests</Button>
              </div>
              <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                {testResults.map((t,i)=> <li key={i} className="break-all">{t}</li>)}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function roundedRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

const STYLE_PRESETS: Record<string, { grad:(ctx:CanvasRenderingContext2D,h:number)=>CanvasGradient; stroke:string; strokeAlpha:number; shadowColor:string; }> = {
  kawaii: {
    grad: (ctx,h)=>{ const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,"#fff7fb"); g.addColorStop(0.45,"#ffd7ec"); g.addColorStop(0.8,"#ffadd6"); g.addColorStop(1,"#ff84c9"); return g; },
    stroke: "#7a3b5a",
    strokeAlpha: 0.55,
    shadowColor: "rgba(255,105,180,0.28)"
  },
  pop: {
    grad: (ctx,h)=>{ const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,"#fff"); g.addColorStop(0.5,"#ffe08a"); g.addColorStop(1,"#ff6b6b"); return g; },
    stroke: "#000000",
    strokeAlpha: 0.85,
    shadowColor: "rgba(0,0,0,0.35)"
  },
  calm: {
    grad: (ctx,h)=>{ const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,"#ffffff"); g.addColorStop(1,"#cfe8ff"); return g; },
    stroke: "#3a4a5a",
    strokeAlpha: 0.5,
    shadowColor: "rgba(60,80,100,0.25)"
  }
};

function drawTextSticker({
  text,
  theme = "",
  w = STICKER_W,
  h = STICKER_H,
  fontKey = "noto",
  padding = 12,
  stroke = true,
  shadow = true,
  emojiLead = true,
  styleKey = "kawaii",
  bubble = true,
}: {
  text: string; theme?: string; w?: number; h?: number; fontKey?: string; padding?: number; stroke?: boolean; shadow?: boolean; emojiLead?: boolean; styleKey?: string; bubble?: boolean;
}){
  const canvas = document.createElement("canvas");
  canvas.width = even(w); canvas.height = even(h);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,w,h);

  const style = STYLE_PRESETS[styleKey] || STYLE_PRESETS.kawaii;

  const safeW = w - padding*2;
  const safeH = h - padding*2;

  // 絵文字やテーマの装飾
  const themeEmoji = emojiLead && theme ? `${pickEmoji(theme)} ` : "";
  const message = `${themeEmoji}${text}`.trim();

  // 背景に淡いバブル（かわいい）
  if (bubble){
    const bx = Math.round(padding*0.7);
    const by = Math.round(padding*0.7);
    const bw = w - Math.round(padding*1.4);
    const bh = h - Math.round(padding*1.4);
    ctx.save();
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = Math.max(6, Math.round(Math.min(w,h)*0.06));
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    roundedRect(ctx, bx, by, bw, bh, Math.round(Math.min(bw,bh)*0.12));
    ctx.fill();
    ctx.restore();
  }

  // 自動フォントサイズ決定（丸ゴ推奨）
  let size = 120;
  const fontFamily = fontKey === "maru" ? "system-ui, -apple-system, \"Hiragino Maru Gothic Pro\", \"Yu Gothic UI\", \"Noto Sans JP\", sans-serif"
    : fontKey === "bizen" ? "\"Yu Mincho\", \"Hiragino Mincho ProN\", serif" : "\"Noto Sans JP\", \"Yu Gothic\", system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  while(size > 12){
    ctx.font = `900 ${size}px ${fontFamily}`;
    const lines = wrapLines(ctx, message, safeW);
    const lh = Math.round(size * 1.08);
    const totalH = lines.length * lh;
    const maxW = Math.max(...lines.map(l=>ctx.measureText(l).width));
    if(totalH <= safeH && maxW <= safeW) break;
    size -= 2;
  }

  ctx.font = `900 ${size}px ${fontFamily}`;
  const lines = wrapLines(ctx, message, safeW);
  const lineHeight = Math.round(size * 1.08);
  const startY = Math.round((h - lineHeight*lines.length)/2 + lineHeight/2);

  // 影 & フチ（スタイル反映）
  if (shadow){
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = Math.max(4, Math.round(size*0.08));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(2, Math.round(size*0.05));
  }
  if (stroke){
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(6, Math.round(size*0.14));
    const strokeHex = (style as any).stroke;
    const strokeAlpha = (style as any).strokeAlpha;
    ctx.strokeStyle = `rgba(${hexToRgb(strokeHex)},${strokeAlpha})`;
  }

  // 塗り（スタイルのグラデ）
  const grad = style.grad(ctx, h);
  ctx.fillStyle = grad;

  lines.forEach((l, idx)=>{
    const y = startY + idx*lineHeight;
    if(stroke) ctx.strokeText(l, Math.round(w/2), y);
    ctx.fillText(l, Math.round(w/2), y);
  });

  ctx.shadowColor = "transparent";
  return canvas;
}

function hexToRgb(hex:string){
  const s = hex.replace('#','');
  const bigint = parseInt(s.length===3 ? s.split('').map(c=>c+c).join('') : s, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r},${g},${b}`;
}

function PreviewText({ title, w, h, text, theme, fontKey, emojiLead, stroke, shadow, styleKey, bubble }:{ title:string, w:number, h:number, text:string, theme:string, fontKey:string, emojiLead:boolean, stroke:boolean, shadow:boolean, styleKey:string, bubble:boolean }){
  const ref = useRef<HTMLCanvasElement>(null);
  React.useEffect(()=>{
    const canvas = ref.current; if(!canvas) return;
    const c = drawTextSticker({ text, theme, w, h, fontKey, padding: Math.max(4, Math.round(Math.min(w,h)*0.06)), emojiLead, stroke, shadow, styleKey, bubble });
    const ctx = canvas.getContext("2d")!; canvas.width = w; canvas.height = h; ctx.clearRect(0,0,w,h); ctx.drawImage(c,0,0);
  },[text,theme,w,h,fontKey,emojiLead,stroke,shadow,styleKey,bubble]);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-slate-600 mb-2">{title}</div>
        <div className="w-full border rounded-xl overflow-hidden bg-[linear-gradient(45deg,#fff1f7_25%,transparent_25%,transparent_75%,#fff1f7_75%),linear-gradient(45deg,#fff1f7_25%,transparent_25%,transparent_75%,#fff1f7_75%)] bg-[length:10px_10px] bg-[position:0_0,5px_5px]">
          <canvas ref={ref} className="w-full h-auto block" />
        </div>
      </CardContent>
    </Card>
  );
}
