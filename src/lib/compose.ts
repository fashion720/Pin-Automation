import sharp from "sharp";
import fs from "fs";
import path from "path";
import satori from "satori";
import type { TemplateDef, FontFamily } from "./templates";
import type { PinStyleOverrides } from "./pinStyle";

const imageCache = new Map<string, Promise<Buffer>>();

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function looksLikeSvg(buffer: Buffer, contentType: string) {
  const head = buffer.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  return contentType.includes("svg") || head.startsWith("<svg") || head.startsWith("<?xml") && head.includes("<svg");
}

async function downloadImage(url: string, referer?: string): Promise<Buffer>{
  const cacheKey = `${referer || ""}::${url}`;
  const existing = imageCache.get(cacheKey);
  if (existing) return existing;
  const task = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);
      try {
        const headers: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        };
        if (referer) headers.Referer = referer;
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) {
          const retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
          lastError = new Error(`Failed to download image (${res.status} ${res.statusText})`);
          if (!retryable || attempt === 3) throw lastError;
          const retryAfter = Number(res.headers.get("retry-after") || 0);
          const backoff = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : Math.min(1000 * 2 ** attempt, 10000);
          await sleep(backoff + Math.floor(Math.random() * 600));
          continue;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 128) throw new Error("Downloaded image is too small to be valid");
        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        // Validate the actual bytes. This catches HTML masquerading as an image
        // and corrupt SVGs such as "svgload_buffer: bad dimensions" before Sharp
        // is allowed to poison the whole generation.
        const metadata = await sharp(buffer, { animated: true }).metadata();
        if (!metadata.width || !metadata.height) {
          if (looksLikeSvg(buffer, contentType)) throw new Error("Invalid SVG image dimensions");
          throw new Error("Image dimensions unavailable");
        }
        if (metadata.width < 120 || metadata.height < 120) throw new Error("Image is too small");
        return buffer;
      } catch (err) {
        lastError = err;
        if (attempt === 3) throw err;
        await sleep(Math.min(900 * 2 ** attempt, 8000) + Math.floor(Math.random() * 500));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Image download failed");
  })();
  imageCache.set(cacheKey, task);
  try { return await task; }
  catch (err) { imageCache.delete(cacheKey); throw err; }
}

export async function loadArticleImages(candidates: string[], referer?: string): Promise<Map<string, Buffer>> {
  const usable = new Map<string, Buffer>();
  const unique = Array.from(new Set(candidates.filter(Boolean)));
  // A small concurrency limit is faster than serial probing without creating a
  // burst large enough to trigger the same CDN/429 problem we are trying to avoid.
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const url = unique[index];
      try {
        usable.set(url, await downloadImage(url, referer));
      } catch (err) {
        console.warn(`[compose] image candidate unavailable: ${url} — ${err instanceof Error ? err.message : err}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  return usable;
}

const FONTS_DIR=path.join(process.cwd(),"src","lib","fonts");
type SatoriFont=Parameters<typeof satori>[1]["fonts"][number];
let fontCache:SatoriFont[]|null=null;
function getFonts():SatoriFont[]{
  if(fontCache)return fontCache;
  const load=(f:string)=>fs.readFileSync(path.join(FONTS_DIR,f));
  fontCache=[
    {name:"Poppins",data:load("Poppins-SemiBold.ttf"),weight:600,style:"normal"},
    {name:"Poppins",data:load("Poppins-Bold.ttf"),weight:700,style:"normal"},
    {name:"Poppins",data:load("Poppins-ExtraBold.ttf"),weight:800,style:"normal"},
    {name:"Oswald",data:load("Oswald-Latin-700.woff"),weight:700,style:"normal"},
    {name:"DM Serif Display",data:load("DMSerifDisplay-Regular.ttf"),weight:400,style:"normal"},
  ];
  return fontCache;
}
function fontName(family:FontFamily|undefined){return family==="serif"?"DM Serif Display":family==="display"?"Oswald":"Poppins";}
function normalizeText(text:string,transform:"none"|"uppercase"|undefined){const clean=text.replace(/[\r\n]+/g," ").replace(/\s+/g," ").trim();return transform==="uppercase"?clean.toUpperCase():clean;}

/** Never truncates a hook. It only wraps whole words and reduces font size when needed. */
function wrapWholeWords(text:string,maxChars:number|undefined){
  if(!maxChars||maxChars<8)return text;
  const lines:string[]=[];let line="";
  for(const word of text.split(" ")){
    const candidate=line?`${line} ${word}`:word;
    if(candidate.length<=maxChars){line=candidate;continue;}
    if(line)lines.push(line);
    line=word;
  }
  if(line)lines.push(line);
  return lines.join("\n");
}

function estimateLineCount(text:string,maxChars:number|undefined){
  if(!maxChars)return 1;
  return wrapWholeWords(text,maxChars).split("\n").length;
}

async function renderTextBlock(params:{
  w:number;h:number;text:string;fontSize:number;color:string;align:"left"|"center"|"right";
  bgColor?:string;bgOpacity?:number;fontFamily?:FontFamily;fontWeight?:number;letterSpacing?:number;lineHeight?:number;
  maxCharsPerLine?:number;maxLines?:number;textTransform?:"none"|"uppercase";textShadow?:boolean;
  shape?:"none"|"rectangle"|"soft"|"pill";borderRadius?:number;borderColor?:string;borderWidth?:number;padding?:number;
}):Promise<Buffer>{
  const {w,h,text,color,align,bgColor,bgOpacity,fontFamily="sans",fontWeight,letterSpacing=0,lineHeight=1.05,maxCharsPerLine,maxLines,textTransform="none",textShadow=true,shape="rectangle",borderRadius,borderColor,borderWidth,padding=10}=params;
  const family=fontName(fontFamily);
  const defaultWeight=family==="DM Serif Display"?400:family==="Oswald"?700:800;
  const normalized=normalizeText(text,textTransform);
  let size=params.fontSize;
  let prepared=wrapWholeWords(normalized,maxCharsPerLine);
  // Fit by whole words. No ellipsis and no half-word clipping.
  for(let i=0;i<12 && maxLines && estimateLineCount(normalized,maxCharsPerLine)>maxLines;i++){
    size=Math.max(32,size-4);
    const adaptive=Math.max(8,Math.round((maxCharsPerLine||30)*(params.fontSize/size)));
    prepared=wrapWholeWords(normalized,adaptive);
    if(estimateLineCount(normalized,adaptive)<=maxLines)break;
  }
  const hasBackground=Boolean(bgColor)&&shape!=="none";
  const radius=shape==="pill"?h/2:shape==="soft"?(borderRadius||Math.min(28,h/5)):0;
  const justifyContent=align==="center"?"center":align==="right"?"flex-end":"flex-start";
  const svg=await satori({type:"div",props:{style:{width:w,height:h,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:justifyContent,backgroundColor:hasBackground?bgColor:"transparent",opacity:bgOpacity!==undefined&&!bgColor?bgOpacity:1,borderRadius:radius,borderColor:borderColor||"transparent",borderWidth:borderWidth||0,borderStyle:borderWidth?"solid":"none",padding,boxSizing:"border-box"},children:{type:"div",props:{style:{width:"100%",display:"flex",flexDirection:"column",justifyContent, fontSize:size,fontWeight:fontWeight??defaultWeight,fontFamily:family,color,textAlign:align,lineHeight,letterSpacing,textShadow:textShadow?(family==="DM Serif Display"?"0 2px 3px rgba(0,0,0,.28)":"0 2px 5px rgba(0,0,0,.42)"):"none",whiteSpace:"pre-wrap",overflowWrap:"normal",wordBreak:"normal"},children:prepared}}}} as Parameters<typeof satori>[0],{width:w,height:h,fonts:getFonts()});
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Renders a pill that hugs its text exactly, instead of guessing a pixel
 * width from character count (which used to leave empty space around short
 * domains and clip long ones). Renders on a wide transparent canvas, then
 * crops to the real content bounds; if that's still wider than maxWidth,
 * shrinks the font and re-measures.
 */
async function renderFooterPill(params:{
  canvasWidth:number;height:number;maxWidth:number;text:string;fontSize:number;
  color:string;bgColor:string;fontFamily?:FontFamily;letterSpacing?:number;
}):Promise<{buffer:Buffer;width:number}>{
  const {canvasWidth,height,maxWidth,text,color,bgColor,fontFamily="sans",letterSpacing=1.4}=params;
  const family=fontName(fontFamily);
  const normalized=normalizeText(text,"uppercase");
  const horizontalPadding=32; // per side — 64px total, matches the old estimate's padding
  let size=params.fontSize;
  let lastBuffer=Buffer.alloc(0);
  let lastWidth=canvasWidth;
  for(let attempt=0;attempt<10;attempt++){
    const svg=await satori({type:"div",props:{style:{width:canvasWidth,height,display:"flex",justifyContent:"center",alignItems:"center"},children:{type:"div",props:{style:{display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:bgColor,borderRadius:height/2,padding:`0 ${horizontalPadding}px`,fontSize:size,fontWeight:800,fontFamily:family,color,letterSpacing,whiteSpace:"nowrap"},children:normalized}}}} as Parameters<typeof satori>[0],{width:canvasWidth,height,fonts:getFonts()});
    const buffer=await sharp(Buffer.from(svg)).trim().png().toBuffer();
    const meta=await sharp(buffer).metadata();
    const width=meta.width||canvasWidth;
    lastBuffer=buffer;lastWidth=width;
    if(width<=maxWidth||size<=16)return{buffer,width};
    size=Math.max(16,size-2);
  }
  return{buffer:lastBuffer,width:lastWidth};
}

async function renderCtaButton(cta:NonNullable<TemplateDef["cta"]>):Promise<Buffer>{
  const family=fontName(cta.fontFamily||"sans");
  const radius=cta.shape==="rectangle"?10:cta.shape==="soft"?16:cta.shape==="pill"||!cta.shape?cta.h/2:0;
  const svg=await satori({type:"div",props:{style:{width:cta.w,height:cta.h,display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:cta.bgColor,borderRadius:radius,borderColor:cta.borderColor||"transparent",borderWidth:cta.borderWidth||0,borderStyle:cta.borderWidth?"solid":"none",boxSizing:"border-box",padding:"0 20px"},children:{type:"div",props:{style:{fontSize:cta.fontSize,fontWeight:cta.fontWeight??700,fontFamily:family,color:cta.textColor,letterSpacing:cta.letterSpacing??1.1,textAlign:"center",whiteSpace:"nowrap"},children:cta.text.toUpperCase()}}}} as Parameters<typeof satori>[0],{width:cta.w,height:cta.h,fonts:getFonts()});
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function hexToRgba(hex:string,opacity:number){
  const value=hex.replace("#","").slice(0,6);
  if(value.length!==6)return hex;
  const r=parseInt(value.slice(0,2),16),g=parseInt(value.slice(2,4),16),b=parseInt(value.slice(4,6),16);
  return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,opacity))})`;
}

function parseHexColor(value:string|undefined){
  if(!value) return null;
  const match=value.match(/#?([0-9a-f]{6})/i);
  if(!match) return null;
  const hex=match[1];
  return {r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)};
}
function relativeLuminance(value:string|undefined){
  const rgb=parseHexColor(value); if(!rgb) return .5;
  const f=(v:number)=>{const c=v/255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;};
  return .2126*f(rgb.r)+.7152*f(rgb.g)+.0722*f(rgb.b);
}
function contrastRatio(a:string|undefined,b:string|undefined){
  const x=relativeLuminance(a),y=relativeLuminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function getContrastingTextColor(background:string|undefined,preferred:string|undefined){
  if(preferred && contrastRatio(background,preferred)>=4.5) return preferred;
  return contrastRatio(background,"#ffffff")>=contrastRatio(background,"#171717")?"#ffffff":"#171717";
}

async function createBase(width:number,height:number){
  return sharp({create:{width,height,channels:4,background:{r:20,g:20,b:20,alpha:1}}});
}

/**
 * Aspect-ratio-aware image fitting for production pin slots.
 *
 * Landscape / near-landscape source images use a controlled `cover` crop so
 * they can actually fill the slot cleanly. This is the important distinction
 * from `contain`: a normal wide article image is allowed to scale up/down and
 * lose only the minimum edge area needed to fill the slot.
 *
 * Very tall portrait images use `inside` instead so a person/product is not
 * aggressively cropped just to fill a landscape slot. No blur, mirror, or
 * image distortion is used.
 */
async function fitImageToSlot(source:Buffer,slot:{w:number;h:number}):Promise<Buffer>{
  const meta=await sharp(source).metadata();
  const srcW=meta.width||0;
  const srcH=meta.height||0;
  if(!srcW||!srcH) throw new Error("Source image dimensions unavailable");

  // Every production image slot must be fully covered. Never use contain here:
  // it creates the black/empty bars visible in 2- and 3-photo layouts when an
  // article image is portrait or otherwise has a different aspect ratio.
  // Sharp's cover mode scales the source proportionally and crops only the
  // excess edges needed to fill the slot; the source is never stretched.
  return sharp(source)
    .resize(slot.w,slot.h,{
      fit:"cover",
      position:"attention",
      withoutEnlargement:false,
      kernel:sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

export async function composePin(template:TemplateDef,imageUrls:string[],overlayText:string,styleOverrides:PinStyleOverrides={}, options:{referer?:string;preloadedImages?:Map<string,Buffer>;candidateUrls?:string[]}={}):Promise<Buffer>{
  // IMPORTANT: built-in preview PNGs are UI previews only. They are never used as
  // a production background, so placeholder rectangles can never leak into pins.
  let base:ReturnType<typeof sharp>;
  if(template.id.startsWith("custom-") && template.backgroundFile){
    const file=template.backgroundFile.startsWith("http")?await downloadImage(template.backgroundFile):fs.readFileSync(path.join(process.cwd(),"public",template.backgroundFile));
    base=sharp(file).resize(template.width,template.height);
  } else {
    base=await createBase(template.width,template.height);
  }
  const composites:Array<{input:Buffer;left:number;top:number}> = [];

  // Load all candidates once, with article Referer headers and retries. If a
  // preferred URL is protected/corrupt, a different srcset/lazy-load candidate
  // can take its place instead of failing the entire article.
  const candidateUrls = Array.from(new Set([...(options.candidateUrls || []), ...imageUrls]));
  const workingBuffers = options.preloadedImages || await loadArticleImages(candidateUrls, options.referer);
  const workingUrls = candidateUrls.filter((u) => workingBuffers.has(u));
  if (workingUrls.length === 0) throw new Error("Is article ki koi bhi image download nahi ho saki (source shayad hotlink-protected hai)");

  // Never reuse the same source image inside one collage. Prefer the requested
  // images first, then fall back to other validated article candidates.
  const preferred = Array.from(new Set(imageUrls)).filter((u) => workingBuffers.has(u));
  const fallback = workingUrls.filter((u) => !preferred.includes(u));
  const urls = [...preferred, ...fallback].slice(0, template.imageSlots.length);
  if (urls.length < template.imageSlots.length) throw new Error(`Template ${template.name} needs ${template.imageSlots.length} different article images, but only ${urls.length} usable images were found.`);

  for(let i=0;i<template.imageSlots.length;i++){
    const slot=template.imageSlots[i];
    const source=workingBuffers.get(urls[i])!;
    const fitted=await fitImageToSlot(source,{w:slot.w,h:slot.h});
    composites.push({input:fitted,left:slot.x,top:slot.y});
  }

  if(overlayText.trim()){
    const t=template.textSlot;
    const x=styleOverrides.headlineX??t.x,y=styleOverrides.headlineY??t.y,w=styleOverrides.headlineWidth??t.w,h=styleOverrides.headlineHeight??t.h;
    const bg=styleOverrides.headlineBackgroundColor?hexToRgba(styleOverrides.headlineBackgroundColor,styleOverrides.headlineBackgroundOpacity??.92):t.bgColor;
    const headlineColor=getContrastingTextColor(styleOverrides.headlineBackgroundColor??t.bgColor,styleOverrides.headlineColor??t.color);
    const textBuf=await renderTextBlock({w,h,text:overlayText,fontSize:styleOverrides.headlineFontSize??t.fontSize,color:headlineColor,align:t.align,bgColor:bg,bgOpacity:t.bgOpacity,fontFamily:styleOverrides.headlineFontFamily??t.fontFamily,fontWeight:t.fontWeight,letterSpacing:styleOverrides.headlineLetterSpacing??t.letterSpacing,lineHeight:styleOverrides.headlineLineHeight??t.lineHeight,maxCharsPerLine:t.maxCharsPerLine,maxLines:t.maxLines,textTransform:styleOverrides.headlineTransform??t.textTransform,textShadow:styleOverrides.headlineShadow??t.textShadow??false,shape:styleOverrides.headlineShape??t.shape,borderRadius:styleOverrides.headlineRadius??t.borderRadius,borderColor:t.borderColor,borderWidth:t.borderWidth,padding:t.padding});
    composites.push({input:textBuf,left:x,top:y});
  }

  if(template.cta&&styleOverrides.ctaVisible!==false){
    const b=template.cta;const w=styleOverrides.ctaWidth??b.w,h=styleOverrides.ctaHeight??b.h;
    const c={...b,text:styleOverrides.ctaText||b.text,w,h,x:styleOverrides.ctaX??b.x,y:styleOverrides.ctaY??b.y,bgColor:styleOverrides.ctaBackgroundColor??b.bgColor,textColor:styleOverrides.ctaTextColor??b.textColor,fontFamily:styleOverrides.ctaFontFamily??b.fontFamily,fontSize:styleOverrides.ctaFontSize??b.fontSize,letterSpacing:styleOverrides.ctaLetterSpacing??b.letterSpacing};
    c.textColor=getContrastingTextColor(c.bgColor,c.textColor);
    composites.push({input:await renderCtaButton(c),left:c.x,top:c.y});
  }

  const footerText=styleOverrides.footerText?.trim()||process.env.FOOTER_BRAND_TEXT?.trim()||"";
  if(template.footer&&footerText){
    const f=template.footer;
    const footerFontSize=styleOverrides.footerFontSize??Math.max(22,f.fontSize);
    const footerHeight=styleOverrides.footerHeight??Math.max(48,f.h);
    const footerY=styleOverrides.footerY??f.y;
    const footerBg=styleOverrides.footerBackgroundColor||f.bgColor||"#111111";
    const footerColor=getContrastingTextColor(footerBg,styleOverrides.footerTextColor||f.color);
    // Cap on how wide the pill is allowed to grow before the font shrinks.
    const maxFooterWidth=styleOverrides.footerWidth??(template.width-80);
    const {buffer:footerBuf,width:footerWidth}=await renderFooterPill({
      canvasWidth:template.width,
      height:footerHeight,
      maxWidth:maxFooterWidth,
      text:footerText,
      fontSize:footerFontSize,
      color:footerColor,
      bgColor:footerBg,
      fontFamily:f.fontFamily,
      letterSpacing:1.4,
    });
    const footerX=Math.max(20,Math.round((template.width-footerWidth)/2));
    composites.push({input:footerBuf,left:footerX,top:footerY});
  }
  return base.composite(composites).png().toBuffer();
}
