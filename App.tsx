import React from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { motion } from 'framer-motion'

const MAX_STICKERS = 40
const STICKER_W = 370
const STICKER_H = 320
const MAIN_W = 240
const MAIN_H = 240
const TAB_W = 96
const TAB_H = 74

function even(n:number){ return n % 2 === 0 ? n : n - 1 }

function drawContainToCanvas(img: HTMLImageElement | ImageBitmap, targetW: number, targetH: number, bgAlpha=0, padding=0){
  const c = document.createElement('canvas')
  c.width = even(targetW); c.height = even(targetH)
  const ctx = c.getContext('2d')!
  ctx.clearRect(0,0,c.width,c.height)
  if (bgAlpha > 0){
    ctx.fillStyle = `rgba(255,255,255,${bgAlpha})`
    ctx.fillRect(0,0,c.width,c.height)
  }
  const innerW = c.width - padding*2
  const innerH = c.height - padding*2
  const imgW = (img as any).width
  const imgH = (img as any).height
  const scale = Math.min(innerW/imgW, innerH/imgH)
  const w = Math.round(imgW*scale)
  const h = Math.round(imgH*scale)
  const dx = Math.round((c.width - w)/2)
  const dy = Math.round((c.height - h)/2)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img as any, dx, dy, w, h)
  return c
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

const PRESETS: Record<string,string[]> = {
  greet: ["おはよう！","こんにちは！","こんばんは！","おつかれさま！","ありがとう！","よろしく！","了解！","ごめん！","おめでとう！","行ってきます","ただいま","またね！","助かる！","お願いします！","すぐ行きます","OK！","NG…","最高！","草","既読スルー許して"],
  polite:["ありがとうございます","よろしくお願いいたします","承知しました","確認します","かしこまりました","ご連絡お待ちしております","お手数ですが","失礼します","お大事に","引き続きよろしく"],
  kansai:["まいど！","ほな！","ええやん","知らんけど","助かったで！","ほんまそれ","しばし待たれい","めっちゃ好き","よっしゃ！","かなんわ〜"],
  season:["新年おめでとう","花見いこ！","暑すぎ！","台風気をつけて","ハロウィンやで","メリークリスマス","良いお年を","年度末がんばろ","花粉つらい","衣替え完了！"],
}

function pickEmoji(theme:string){
  const t = theme.toLowerCase()
  if (/(朝|おは|morning)/.test(t)) return "🌅"
  if (/(昼|こんにちは|noon|day)/.test(t)) return "🌞"
  if (/(夜|こんばんは|night)/.test(t)) return "🌙"
  if (/(ありがとう|thanks|感謝)/.test(t)) return "🙏"
  if (/(おめ|祝|congrats)/.test(t)) return "🎉"
  if (/(季節|春|花見|sakura)/.test(t)) return "🌸"
  if (/(夏|暑)/.test(t)) return "🌊"
  if (/(秋|紅葉)/.test(t)) return "🍁"
  if (/(冬|雪|xmas|クリスマス)/.test(t)) return "❄️"
  if (/(仕事|ビジネス|ok|了解|承知)/.test(t)) return "📌"
  return "✨"
}

function wrapLines(ctx:CanvasRenderingContext2D, text:string, maxWidth:number){
  const chars = [...text]
  const lines:string[] = []
  let line = ""
  for(const ch of chars){
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line !== ""){
      lines.push(line); line = ch
    }else{
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function hexToRgb(hex:string){
  const s = hex.replace('#','')
  const v = parseInt(s.length===3 ? s.split('').map(c=>c+c).join('') : s, 16)
  const r = (v>>16)&255, g=(v>>8)&255, b=v&255
  return `${r},${g},${b}`
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
}

function roundedRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number){
  r = Math.min(r, w/2, h/2)
  ctx.beginPath()
  ctx.moveTo(x+r,y)
  ctx.arcTo(x+w,y,x+w,y+h,r)
  ctx.arcTo(x+w,y+h,x,y+h,r)
  ctx.arcTo(x,y+h,x,y,r)
  ctx.arcTo(x,y,x+w,y,r)
  ctx.closePath()
}

function drawTextSticker({ text, theme="", w=STICKER_W, h=STICKER_H, fontKey="noto", padding=12, stroke=true, shadow=true, emojiLead=true, styleKey="kawaii", bubble=true }:{
  text:string; theme?:string; w?:number; h?:number; fontKey?:string; padding?:number; stroke?:boolean; shadow?:boolean; emojiLead?:boolean; styleKey?:string; bubble?:boolean;
}){
  const canvas = document.createElement('canvas')
  canvas.width = even(w); canvas.height = even(h)
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0,0,w,h)

  const style = STYLE_PRESETS[styleKey] || STYLE_PRESETS.kawaii
  const safeW = w - padding*2; const safeH = h - padding*2
  const themeEmoji = emojiLead && theme ? `${pickEmoji(theme)} ` : ""
  const message = `${themeEmoji}${text}`.trim()

  if (bubble){
    const bx = Math.round(padding*0.7), by=bx
    const bw = w - Math.round(padding*1.4), bh = h - Math.round(padding*1.4)
    ctx.save()
    ctx.shadowColor = style.shadowColor
    ctx.shadowBlur = Math.max(6, Math.round(Math.min(w,h)*0.06))
    ctx.shadowOffsetY = 2
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    roundedRect(ctx, bx, by, bw, bh, Math.round(Math.min(bw,bh)*0.12))
    ctx.fill()
    ctx.restore()
  }

  let size = 120
  const fontFamily = fontKey === 'maru' ? 'system-ui, -apple-system, "Hiragino Maru Gothic Pro", "Yu Gothic UI", "Noto Sans JP", sans-serif'
    : fontKey === 'bizen' ? '"Yu Mincho", "Hiragino Mincho ProN", serif' : '"Noto Sans JP","Yu Gothic", system-ui, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

  while(size > 12){
    ctx.font = `900 ${size}px ${fontFamily}`
    const lines = wrapLines(ctx, message, safeW)
    const lh = Math.round(size*1.08)
    const totalH = lines.length * lh
    const maxW = Math.max(...lines.map(l=>ctx.measureText(l).width))
    if(totalH <= safeH && maxW <= safeW) break
    size -= 2
  }

  ctx.font = `900 ${size}px ${fontFamily}`
  const lines = wrapLines(ctx, message, safeW)
  const lineHeight = Math.round(size*1.08)
  const startY = Math.round((h - lineHeight*lines.length)/2 + lineHeight/2)

  if (shadow){
    ctx.shadowColor = style.shadowColor
    ctx.shadowBlur = Math.max(4, Math.round(size*0.08))
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = Math.max(2, Math.round(size*0.05))
  }
  if (stroke){
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(6, Math.round(size*0.14))
    ctx.strokeStyle = `rgba(${hexToRgb(style.stroke)},${style.strokeAlpha})`
  }

  const grad = style.grad(ctx, h)
  ctx.fillStyle = grad

  lines.forEach((l, i)=>{
    const y = startY + i*lineHeight
    if (stroke) ctx.strokeText(l, Math.round(w/2), y)
    ctx.fillText(l, Math.round(w/2), y)
  })

  ctx.shadowColor = 'transparent'
  return canvas
}

function setupPWA(){
  const makeIcon = (size:number)=>{
    const c = document.createElement('canvas'); c.width=size; c.height=size; const ctx=c.getContext('2d')!
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle='#ff84c9';
    ctx.beginPath();
    const r=size*0.18, cx=size*0.35, cy=size*0.35, cx2=size*0.65, cy2=size*0.35;
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.arc(cx2, cy2, r, Math.PI, 0);
    ctx.lineTo(size*0.80, size*0.62);
    ctx.quadraticCurveTo(size*0.50, size*0.95, size*0.20, size*0.62);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#7a3b5a';
    ctx.beginPath(); ctx.arc(size*0.52,size*0.53,size*0.03,0,Math.PI*2); ctx.fill();
    return c.toDataURL('image/png');
  };
  const manifest:any = {
    name:'LINE Sticker Maker (Kawaii)',
    short_name:'Stickers',
    start_url:'.', scope:'.',
    display:'standalone',
    theme_color:'#ff84c9',
    background_color:'#ffffff',
    icons:[{src:makeIcon(192),sizes:'192x192',type:'image/png'},{src:makeIcon(512),sizes:'512x512',type:'image/png'}]
  }
  const blob = new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'})
  const url = URL.createObjectURL(blob)
  let link = document.querySelector(\"link[rel='manifest']\") as HTMLLinkElement | null
  if(!link){ link = document.createElement('link'); link.rel='manifest'; document.head.appendChild(link) }
  link.href = url

  let meta = document.querySelector(\"meta[name='theme-color']\") as HTMLMetaElement | null
  if(!meta){ meta = document.createElement('meta'); meta.name='theme-color'; document.head.appendChild(meta) }
  meta.content = '#ff84c9'

  if('serviceWorker' in navigator){
    const sw = `
      const CACHE='kawaii-stickers-v1';
      const CORE=['./'];
      self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
      self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))).then(()=>self.clients.claim()))});
      self.addEventListener('fetch',e=>{
        const r=e.request; if(r.method!=='GET') return;
        e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{const cp=res.clone(); caches.open(CACHE).then(c=>{try{c.put(r,cp)}catch(_){}}); return res;}).catch(()=>caches.match('./'))));
      });
    `
    const b = new Blob([sw],{type:'text/javascript'})
    const swUrl = URL.createObjectURL(b)
    navigator.serviceWorker.register(swUrl, {scope:'./'}).catch(()=>{})
  }
}

export default function App(){
  const [mode, setMode] = React.useState<'image'|'auto'>('auto')

  const [files, setFiles] = React.useState<File[]>([])
  const [images, setImages] = React.useState<string[]>([])
  const [count, setCount] = React.useState<8|16|24|32|40>(8)
  const [padding, setPadding] = React.useState(10)
  const [bgAlpha, setBgAlpha] = React.useState(0)
  const [mainIndex, setMainIndex] = React.useState(0)
  const [tabIndex, setTabIndex] = React.useState(0)
  const [exporting, setExporting] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  const [theme, setTheme] = React.useState('かわいい挨拶')
  const [preset, setPreset] = React.useState('greet')
  const [customTexts, setCustomTexts] = React.useState('')
  const [fontKey, setFontKey] = React.useState('maru')
  const [emojiLead, setEmojiLead] = React.useState(true)
  const [stroke, setStroke] = React.useState(true)
  const [shadow, setShadow] = React.useState(true)
  const [styleKey, setStyleKey] = React.useState('kawaii')
  const [bubble, setBubble] = React.useState(true)

  React.useEffect(()=>{ setupPWA() }, [])

  async function onFilesPicked(list: FileList | null){
    if(!list) return
    const arr = Array.from(list).slice(0, MAX_STICKERS)
    const valid = arr.filter(f=>/image\/(png|jpeg|webp)/i.test(f.type))
    const urls = await Promise.all(valid.map(f=>new Promise<string>(res=>{ const r = new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f); })))
    setFiles(valid); setImages(urls); setMainIndex(0); setTabIndex(0)
  }

  async function exportZIPFromImages(){
    if(images.length===0){ alert('画像を追加してください'); return }
    setExporting(true); setProgress(0)
    try{
      const zip = new JSZip()
      zip.file('README.txt', `Exported by LINE Sticker Maker (web)
Specs: Sticker up to ${STICKER_W}x${STICKER_H} (even), PNG, <=1MB; Main ${MAIN_W}x${MAIN_H}; Tab ${TAB_W}x${TAB_H}`)
      const used = images.slice(0, count)
      for(let i=0;i<used.length;i++){
        setProgress(Math.round((i/used.length)*70))
        const url = used[i]
        const img = await createImageBitmap(await (await fetch(url)).blob())
        const c = drawContainToCanvas(img, STICKER_W, STICKER_H, bgAlpha, padding)
        const data = c.toDataURL('image/png')
        const file = dataURLtoFile(data, `${String(i+1).padStart(2,'0')}.png`)
        zip.file(file.name, file)
      }
      // main/tab
      {
        const img = await createImageBitmap(await (await fetch(images[mainIndex]||images[0])).blob())
        const c = drawContainToCanvas(img, MAIN_W, MAIN_H, bgAlpha, Math.round(padding*MAIN_W/STICKER_W))
        zip.file('main.png', dataURLtoFile(c.toDataURL('image/png'), 'main.png'))
      }
      {
        const img = await createImageBitmap(await (await fetch(images[tabIndex]||images[0])).blob())
        const c = drawContainToCanvas(img, TAB_W, TAB_H, bgAlpha, Math.round(padding*TAB_W/STICKER_W))
        zip.file('tab.png', dataURLtoFile(c.toDataURL('image/png'), 'tab.png'))
      }

      const blob = await zip.generateAsync({type:'blob'})
      saveAs(blob, `line-stickers-${count}.zip`)
      setProgress(100)
      alert('ZIPを書き出しました！')
    }catch(e){ console.error(e); alert('書き出しでエラー') }
    finally{ setExporting(false) }
  }

  async function exportZIPFromTexts(){
    const base = PRESETS[preset] || []
    const extra = customTexts.split(/\n|,|，|、/).map(s=>s.trim()).filter(Boolean)
    const all = (base.concat(extra)).slice(0, count)
    if(all.length===0){ alert('テキストがありません'); return }
    setExporting(true); setProgress(0)
    try{
      const zip = new JSZip()
      zip.file('README.txt', `Exported by LINE Sticker Maker (Auto-Text)
Theme:${theme}; Font:${fontKey}; Style:${styleKey}; bubble:${bubble}`)
      for(let i=0;i<all.length;i++){
        setProgress(Math.round((i/all.length)*70))
        const c = drawTextSticker({ text: all[i], theme, w: STICKER_W, h: STICKER_H, fontKey, padding: 16, stroke, shadow, emojiLead, styleKey, bubble })
        zip.file(`${String(i+1).padStart(2,'0')}.png`, dataURLtoFile(c.toDataURL('image/png'), `${String(i+1).padStart(2,'0')}.png`))
      }
      {
        const c = drawTextSticker({ text: all[0]||'MAIN', theme, w: MAIN_W, h: MAIN_H, fontKey, padding: 10, stroke, shadow, emojiLead, styleKey, bubble })
        zip.file('main.png', dataURLtoFile(c.toDataURL('image/png'), 'main.png'))
      }
      {
        const c = drawTextSticker({ text: all[0]||'TAB', theme, w: TAB_W, h: TAB_H, fontKey, padding: 6, stroke, shadow, emojiLead, styleKey, bubble })
        zip.file('tab.png', dataURLtoFile(c.toDataURL('image/png'), 'tab.png'))
      }
      const blob = await zip.generateAsync({type:'blob'})
      saveAs(blob, `line-stickers-auto-${all.length}.zip`)
      setProgress(100); alert('おまかせスタンプを書き出しました！')
    }catch(e){ console.error(e); alert('書き出しでエラー') }
    finally{ setExporting(false); setProgress(0) }
  }

  return (
    <div style={{minHeight:'100vh', background:'linear-gradient(#fff,#ffeef6)', padding:'16px'}}>
      <motion.h1 initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} style={{fontSize:28, fontWeight:800, marginBottom:8}}>
        LINEスタンプ作成アプリ（PWA / かわいい）
      </motion.h1>
      <p style={{color:'#475569', marginBottom:16}}>画像から作る／テーマと挨拶だけで自動生成。370×320（PNG透過）でZIP出力、main/tab付き。</p>

      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <button onClick={()=>setMode('image')} style={{padding:'8px 12px', borderRadius:8, border: mode==='image'?'2px solid #ec4899':'1px solid #cbd5e1', background:'#fff'}}>画像から</button>
        <button onClick={()=>setMode('auto')} style={{padding:'8px 12px', borderRadius:8, border: mode==='auto'?'2px solid #ec4899':'1px solid #cbd5e1', background:'#fff'}}>💖 オールおまかせ</button>
        <button onClick={()=>{ setupPWA(); alert('PWA準備完了：ホーム画面に追加できます') }} style={{marginLeft:'auto', padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff'}}>📲 PWA準備</button>
      </div>

      {mode==='image' ? (
        <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:12, marginBottom:12}}>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center'}}>
            <label>画像（PNG/JPG/WebP 最大40枚）：</label>
            <input type="file" multiple accept="image/*" onChange={e=>onFilesPicked(e.target.files)} />
            <div>セット枚数：{[8,16,24,32,40].map(n=>(
              <button key={n} onClick={()=>setCount(n as any)} style={{margin:'0 4px', padding:'4px 8px', borderRadius:8, border: count===n?'2px solid #ec4899':'1px solid #cbd5e1', background:'#fff'}}>{n}</button>
            ))}</div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px,1fr))', gap:8, marginTop:12}}>
            {images.map((src,i)=>(<div key={i} style={{position:'relative'}}>
              <img src={src} style={{width:'100%', height:120, objectFit:'cover', borderRadius:12, border:'1px solid #e2e8f0'}}/>
              <div style={{position:'absolute', bottom:6, left:6, display:'flex', gap:6}}>
                <button onClick={()=>setMainIndex(i)} style={{padding:'2px 6px', borderRadius:8, border:'1px solid #94a3b8', background:'#fff'}}>メイン</button>
                <button onClick={()=>setTabIndex(i)} style={{padding:'2px 6px', borderRadius:8, border:'1px solid #94a3b8', background:'#fff'}}>タブ</button>
              </div>
            </div>))}
          </div>

          <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginTop:12}}>
            <label>余白：{padding}px</label>
            <input type="range" min={0} max={30} value={padding} onChange={e=>setPadding(parseInt(e.target.value))}/>
            <label>背景の不透明度：{bgAlpha}</label>
            <input type="range" min={0} max={1} step={0.05} value={bgAlpha} onChange={e=>setBgAlpha(parseFloat(e.target.value))}/>
          </div>

          <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
            <button onClick={exportZIPFromImages} disabled={exporting || images.length===0} style={{padding:'8px 12px', borderRadius:8, border:'1px solid #ec4899', background:'#fff'}}>📦 ZIPに書き出す</button>
            {exporting && <div>書き出し中… {progress}%</div>}
          </div>
        </div>
      ):(
        <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:12}}>
          <div style={{display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))'}}>
            <div><label>テーマ</label><input value={theme} onChange={e=>setTheme(e.target.value)} placeholder="例：朝の挨拶" style={{width:'100%'}}/></div>
            <div><label>プリセット</label>
              <select value={preset} onChange={e=>setPreset(e.target.value)} style={{width:'100%'}}>
                <option value="greet">基本の挨拶</option>
                <option value="polite">ていねい・ビジネス</option>
                <option value="kansai">関西ことば</option>
                <option value="season">季節ネタ</option>
              </select>
            </div>
            <div><label>フォント</label>
              <select value={fontKey} onChange={e=>setFontKey(e.target.value)} style={{width:'100%'}}>
                <option value="noto">Noto Sans JP</option>
                <option value="maru">丸ゴ風</option>
                <option value="bizen">明朝風</option>
              </select>
            </div>
            <div><label>スタイル</label>
              <select value={styleKey} onChange={e=>setStyleKey(e.target.value)} style={{width:'100%'}}>
                <option value="kawaii">かわいい</option>
                <option value="pop">ポップ</option>
                <option value="calm">おだやか</option>
              </select>
            </div>
          </div>

          <div style={{display:'flex', flexWrap:'wrap', gap:12, marginTop:8}}>
            <label><input type="checkbox" checked={emojiLead} onChange={e=>setEmojiLead(e.target.checked)}/> 絵文字自動付与</label>
            <label><input type="checkbox" checked={stroke} onChange={e=>setStroke(e.target.checked)}/> 太フチ</label>
            <label><input type="checkbox" checked={shadow} onChange={e=>setShadow(e.target.checked)}/> 影</label>
            <label><input type="checkbox" checked={bubble} onChange={e=>setBubble(e.target.checked)}/> かわいいバブル背景</label>
            <div>セット枚数：{[8,16,24,32,40].map(n=>(
              <button key={n} onClick={()=>setCount(n as any)} style={{margin:'0 4px', padding:'4px 8px', borderRadius:8, border: count===n?'2px solid #ec4899':'1px solid #cbd5e1', background:'#fff'}}>{n}</button>
            ))}</div>
          </div>

          <div style={{marginTop:8}}>
            <label>追加フレーズ（改行/、/，/, 区切り）</label>
            <textarea rows={4} value={customTexts} onChange={e=>setCustomTexts(e.target.value)} style={{width:'100%'}} placeholder="例）\nおやすみ\n今向かってます\n会議入ります"/>
          </div>

          <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
            <button onClick={exportZIPFromTexts} disabled={exporting} style={{padding:'8px 12px', borderRadius:8, border:'1px solid #ec4899', background:'#fff'}}>💝 おまかせ生成→ZIP</button>
            {exporting && <div>生成中… {progress}%</div>}
          </div>

          <div style={{marginTop:16, display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))'}}>
            <Preview title="スタンプ（370×320）サンプル" w={STICKER_W} h={STICKER_H} text={(PRESETS[preset]?.[0]||'サンプル')} theme={theme} fontKey={fontKey} emojiLead={emojiLead} stroke={stroke} shadow={shadow} styleKey={styleKey} bubble={bubble}/>
            <Preview title="メイン（240×240）" w={MAIN_W} h={MAIN_H} text={(PRESETS[preset]?.[0]||'MAIN')} theme={theme} fontKey={fontKey} emojiLead={emojiLead} stroke={stroke} shadow={shadow} styleKey={styleKey} bubble={bubble}/>
            <Preview title="タブ（96×74）" w={TAB_W} h={TAB_H} text={(PRESETS[preset]?.[0]||'TAB')} theme={theme} fontKey={fontKey} emojiLead={emojiLead} stroke={stroke} shadow={shadow} styleKey={styleKey} bubble={bubble}/>
          </div>
        </div>
      )}
    </div>
  )
}

function Preview({title, w, h, text, theme, fontKey, emojiLead, stroke, shadow, styleKey, bubble}:{title:string; w:number; h:number; text:string; theme:string; fontKey:string; emojiLead:boolean; stroke:boolean; shadow:boolean; styleKey:string; bubble:boolean}){
  const ref = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(()=>{
    const canvas = ref.current; if(!canvas) return
    const c = drawTextSticker({ text, theme, w, h, fontKey, padding: Math.max(4, Math.round(Math.min(w,h)*0.06)), emojiLead, stroke, shadow, styleKey, bubble })
    const ctx = canvas.getContext('2d')!; canvas.width=w; canvas.height=h; ctx.clearRect(0,0,w,h); ctx.drawImage(c,0,0)
  },[text,theme,w,h,fontKey,emojiLead,stroke,shadow,styleKey,bubble])
  return <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:8}}>
    <div style={{fontSize:12, color:'#475569', marginBottom:6}}>{title}</div>
    <div style={{backgroundImage:'linear-gradient(45deg,#fff1f7 25%,transparent 25%,transparent 75%,#fff1f7 75%),linear-gradient(45deg,#fff1f7 25%,transparent 25%,transparent 75%,#fff1f7 75%)', backgroundSize:'10px 10px', backgroundPosition:'0 0,5px 5px', borderRadius:12, overflow:'hidden'}}>
      <canvas ref={ref} style={{width:'100%', height:'auto', display:'block'}}/>
    </div>
  </div>
}
