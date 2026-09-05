import sharp from "sharp";
import fs from "fs";
import path from "path";
import satori from "satori";
import type { TemplateDef, FontFamily } from "./templates";
import type { PinStyleOverrides } from "./pinStyle";

async function downloadImage(url:string):Promise<Buffer>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const res=await fetch(url,{
      signal:controller.signal,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if(!res.ok)throw new Error(`Failed to download image: ${url} (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
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

function repeatPool(urls:string[],count:number){
  if(!urls.length)throw new Error("No article images available for this pin");
  return Array.from({length:count},(_,i)=>urls[i%urls.length]);
}

export async function composePin(template:TemplateDef,imageUrls:string[],overlayText:string,styleOverrides:PinStyleOverrides={}):Promise<Buffer>{
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

  // Pre-fetch each unique article image once and skip any that fail (e.g. a
  // hotlink/bot-protected external CDN like a third-party site's image
  // embedded in the post) instead of failing the whole pin.
  const uniqueUrls=Array.from(new Set(imageUrls));
  const workingBuffers=new Map<string,Buffer>();
  for(const url of uniqueUrls){
    try{
      workingBuffers.set(url,await downloadImage(url));
    } catch(err){
      console.warn(`[compose] skipping unreachable image: ${url} — ${err instanceof Error?err.message:err}`);
    }
  }
  const workingUrls=imageUrls.filter((u)=>workingBuffers.has(u));
  if(workingUrls.length===0)throw new Error("Is article ki koi bhi image download nahi ho saki (source shayad hotlink-protected hai)");

  const urls=repeatPool(workingUrls,template.imageSlots.length);

  for(let i=0;i<template.imageSlots.length;i++){
    const slot=template.imageSlots[i];
    const source=workingBuffers.get(urls[i])!;
    const resized=await sharp(source).resize(slot.w,slot.h,{fit:"cover",position:"attention"}).jpeg({quality:94}).toBuffer();
    composites.push({input:resized,left:slot.x,top:slot.y});
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

  if(template.footer){
    const f=template.footer;const footerText=styleOverrides.footerText?.trim()||process.env.FOOTER_BRAND_TEXT?.trim()||f.text;
    const estimatedWidth=Math.max(240,Math.min(560,Math.round(footerText.length*16+72)));
    const footerWidth=styleOverrides.footerWidth??Math.max(f.w,estimatedWidth);
    const footerHeight=styleOverrides.footerHeight??Math.max(48,f.h);
    const footerY=styleOverrides.footerY??f.y;
    const footerBg=styleOverrides.footerBackgroundColor||f.bgColor||"#111111";
    const footerColor=getContrastingTextColor(footerBg,styleOverrides.footerTextColor||f.color);
    const footerX=Math.max(20,Math.round((template.width-footerWidth)/2));
    const footerBuf=await renderTextBlock({w:footerWidth,h:footerHeight,text:footerText,fontSize:styleOverrides.footerFontSize??Math.max(22,f.fontSize),color:footerColor,align:"center",bgColor:footerBg,fontFamily:f.fontFamily,fontWeight:800,letterSpacing:1.4,lineHeight:1,maxCharsPerLine:footerText.length+2,maxLines:1,textTransform:"uppercase",shape:"pill",borderRadius:footerHeight/2,textShadow:false,padding:10});
    composites.push({input:footerBuf,left:footerX,top:footerY});
  }
  return base.composite(composites).png().toBuffer();
}
