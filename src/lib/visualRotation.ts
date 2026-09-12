import type { PinStyleOverrides } from "./pinStyle";
import type { TemplateDef } from "./templates";

function hashString(value:string){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rotateLayoutIds(layoutIds:string[],articleUrl:string){if(layoutIds.length<2)return[...layoutIds];const offset=hashString(`order:${articleUrl}`)%layoutIds.length;return[...layoutIds.slice(offset),...layoutIds.slice(0,offset)];}

const PALETTES=[
  {bg:"#111111",fg:"#ffffff",accent:"#c65a40",footer:"#e7c2a3"},
  {bg:"#f5eadb",fg:"#202020",accent:"#202020",footer:"#202020"},
  {bg:"#6f2f4a",fg:"#ffffff",accent:"#e8b2c0",footer:"#e8b2c0"},
  {bg:"#173a35",fg:"#ffffff",accent:"#d5a55f",footer:"#d5a55f"},
  {bg:"#314b68",fg:"#ffffff",accent:"#e7c77b",footer:"#e7c77b"},
  {bg:"#eee8df",fg:"#202020",accent:"#7d4f3d",footer:"#7d4f3d"},
  {bg:"#5c3b58",fg:"#ffffff",accent:"#dcb4d5",footer:"#dcb4d5"},
];
const FONTS=["sans","display","serif"] as const;
function parseHex(value:string){const m=value.match(/#?([0-9a-f]{6})/i);if(!m)return null;const h=m[1];return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};}
function luminance(value:string){const rgb=parseHex(value);if(!rgb)return .5;const f=(v:number)=>{const c=v/255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;};return .2126*f(rgb.r)+.7152*f(rgb.g)+.0722*f(rgb.b);}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function readableText(background:string){return contrast(background,"#ffffff")>=contrast(background,"#171717")?"#ffffff":"#171717";}

/**
 * Human-looking variation: typography, palette, banner shape and small size
 * changes. Geometry is derived from the current template, never copied from a
 * different template, so rotation cannot move a banner into photography or
 * create oversized empty areas.
 */
export function getAutomaticStyleOverrides(template:TemplateDef,articleUrl:string,variantIndex:number):PinStyleOverrides{
  const seed=hashString(`visual:${articleUrl}:${template.id}:${variantIndex}`);
  const palette=PALETTES[seed%PALETTES.length];
  const font=FONTS[Math.floor(seed/7)%FONTS.length];
  const shapeCycle=["rectangle","soft","pill"] as const;
  const shape=shapeCycle[Math.floor(seed/13)%shapeCycle.length];
  const t=template.textSlot;
  const scale=[.94,1,1.04,.97][Math.floor(seed/17)%4];
  const width=Math.max(220,Math.min(940,Math.round(t.w*scale)));
  const height=Math.max(110,Math.min(430,Math.round(t.h*(scale<1?1.03:scale))));
  const x=Math.max(20,Math.min(template.width-width-20,Math.round(t.x+(t.w-width)/2)));
  const y=Math.max(20,Math.min(template.height-height-20,Math.round(t.y+(t.h-height)/2)));
  const fontSize=Math.max(38,Math.round(t.fontSize*(.94+((seed>>5)%4)*.025)));
  const cta=template.cta;
  const ctaWidth=cta?Math.max(320,Math.min(520,Math.round(cta.w*(seed%3===0?1.1:seed%3===1?1.02:1.06)))):undefined;
  const ctaHeight=cta?Math.max(78,Math.min(104,Math.round(cta.h*(seed%2===0?1.08:1.04)))):undefined;
  const ctaX=cta&&ctaWidth?Math.max(20,Math.min(template.width-ctaWidth-20,Math.round(cta.x+(cta.w-ctaWidth)/2))):undefined;
  const ctaY=cta&&ctaHeight?Math.max(20,Math.min(template.height-ctaHeight-20, 1322, Math.round(cta.y+(cta.h-ctaHeight)/2))):undefined;
  const blogCtas=["SEE MORE IDEAS","EXPLORE MORE IDEAS","VIEW MORE IDEAS","GET MORE IDEAS","READ MORE IDEAS"] as const;
  const footerWidth=Math.max(250,Math.min(520,260+((variantIndex+template.id.length)*17)%180));
  const footerBg=palette.footer;
  return {
    headlineColor:readableText(palette.bg),headlineBackgroundColor:palette.bg,headlineBackgroundOpacity:.93,
    headlineFontFamily:font,headlineFontSize:fontSize,headlineLineHeight:t.lineHeight??.96,
    headlineLetterSpacing:font==="display"?0.3:0,headlineTransform:font==="display"?"uppercase":(t.textTransform??"none"),
    headlineShadow:false,headlineX:x,headlineY:y,headlineWidth:width,headlineHeight:height,
    headlineRadius:shape==="pill"?height/2:(t.borderRadius??16),headlineShape:shape,
    ctaText:blogCtas[seed%blogCtas.length],
    ctaBackgroundColor:palette.accent,ctaTextColor:readableText(palette.accent),ctaFontFamily:"sans",ctaFontSize:cta?Math.max(22,Math.round(cta.fontSize*1.14)):24,
    ctaWidth,ctaHeight,ctaX,ctaY,ctaLetterSpacing:1.05,
    footerBackgroundColor:footerBg,footerTextColor:readableText(footerBg),footerWidth,footerHeight:48,footerY:1440,footerFontSize:24,
  };
}
