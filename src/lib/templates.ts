export interface ImageSlot { x:number; y:number; w:number; h:number; }
export type FontFamily = "sans" | "display" | "serif";
export type BannerShape = "none" | "rectangle" | "soft" | "pill";
export interface TextSlot {
  x:number; y:number; w:number; h:number; fontSize:number; color:string; align:"left"|"center"|"right";
  fontFamily?:FontFamily; fontWeight?:400|600|700|800; letterSpacing?:number; lineHeight?:number;
  maxCharsPerLine?:number; maxLines?:number; textTransform?:"none"|"uppercase";
  bgColor?:string; bgOpacity?:number; shape?:BannerShape; borderRadius?:number;
  borderColor?:string; borderWidth?:number; textShadow?:boolean; padding?:number;
}
export interface CtaButton {
  text:string; x:number; y:number; w:number; h:number; bgColor:string; textColor:string; fontSize:number;
  fontFamily?:FontFamily; fontWeight?:400|600|700|800; letterSpacing?:number; shape?:BannerShape;
  borderColor?:string; borderWidth?:number;
}
export interface FooterSlot {
  text:string; x:number; y:number; w:number; h:number; fontSize:number; color:string; align:"left"|"center"|"right";
  fontFamily?:FontFamily; fontWeight?:400|600|700|800; letterSpacing?:number; lineHeight?:number;
  maxCharsPerLine?:number; maxLines?:number; textTransform?:"none"|"uppercase"; bgColor?:string;
}
export interface TemplateDef {
  id:string; name:string; imageCount:number; width:number; height:number; backgroundFile:string;
  imageSlots:ImageSlot[]; textSlot:TextSlot; cta?:CtaButton; footer?:FooterSlot; designBrief?:string;
  selectionLabel?:string; category?:string; family?:string;
}

const SIZE={width:1000,height:1500};
const PREVIEW=(n:number)=>`/templates/layout-${String(n).padStart(2,"0")}.png`;
const footer=(color:string="#fff", align:FooterSlot["align"]="center"):FooterSlot=>({
  text:"YOUR SITE", x:290,y:1450,w:420,h:42,fontSize:24,color,align:"center",fontFamily:"sans",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase",bgColor:"#111111"
});
const cta=(text:string,bg:string="#111",fg:string="#fff",x=350,y=1340,w=300):CtaButton=>({
  text,x,y,w,h:86,bgColor:bg,textColor:fg,fontSize:24,fontFamily:"sans",fontWeight:700,letterSpacing:1.1,shape:"pill"
});

/**
 * Production Pinterest compositions. Image slots deliberately cover the whole
 * 1000x1500 canvas so there are no background/placeholder holes in generated pins.
 * Text and CTA are overlays, not reserved empty regions.
 */
const RAW_TEMPLATES:TemplateDef[]=[
  {
    id:"layout-1",name:"4-Photo Centre Banner",imageCount:4,...SIZE,backgroundFile:PREVIEW(1),family:"center-collage",category:"Editorial & Fashion",
    designBrief:"Four full-bleed photos in a 2x2 editorial grid. Put a strong searchable hook on a substantial centre banner without squeezing the photos.",
    imageSlots:[{x:0,y:0,w:500,h:600},{x:500,y:0,w:500,h:600},{x:0,y:900,w:500,h:600},{x:500,y:900,w:500,h:600}],
    textSlot:{x:0,y:600,w:1000,h:300,fontSize:66,color:"#fff",align:"center",fontFamily:"display",fontWeight:700,lineHeight:.92,maxCharsPerLine:20,maxLines:3,textTransform:"uppercase",bgColor:"#111",shape:"soft",borderRadius:18,padding:26,textShadow:false},
    cta:cta("SEE MORE IDEAS","#fff","#111",350,1265,300),footer:footer("#fff","center")
  },
  {
    id:"layout-2",name:"4-Photo Floating Editorial",imageCount:4,...SIZE,backgroundFile:PREVIEW(2),family:"four-grid",category:"Collage",
    designBrief:"Four edge-to-edge photos with a narrower floating paper banner across the middle. Keep every photo large and readable.",
    imageSlots:[{x:0,y:0,w:500,h:600},{x:500,y:0,w:500,h:600},{x:0,y:900,w:500,h:600},{x:500,y:900,w:500,h:600}],
    textSlot:{x:0,y:600,w:1000,h:300,fontSize:60,color:"#202020",align:"center",fontFamily:"serif",fontWeight:400,lineHeight:.98,maxCharsPerLine:22,maxLines:3,bgColor:"#f7ead8",shape:"soft",borderRadius:22,padding:24,textShadow:false},
    cta:cta("EXPLORE MORE IDEAS","#202020","#fff",335,1285,330),footer:footer("#fff")
  },
  {
    id:"layout-3",name:"Full Hero + Overlap Headline",imageCount:1,...SIZE,backgroundFile:PREVIEW(3),family:"hero-overlap",category:"Editorial & Fashion",
    designBrief:"One article hero photo fills the entire pin. A large editorial headline overlaps the lower third; the photo must never be letterboxed.",
    imageSlots:[{x:0,y:0,w:1000,h:1500}],
    textSlot:{x:55,y:980,w:890,h:280,fontSize:74,color:"#fff",align:"left",fontFamily:"display",fontWeight:700,lineHeight:.9,maxCharsPerLine:19,maxLines:4,textTransform:"uppercase",bgColor:"#111",bgOpacity:.88,shape:"rectangle",padding:26,textShadow:false},
    cta:cta("VIEW MORE IDEAS","#fff","#111",60,1305,260),footer:footer("#fff","right")
  },
  {
    id:"layout-4",name:"Top + Bottom Centre Banner",imageCount:2,...SIZE,backgroundFile:PREVIEW(4),family:"top-bottom-banner",category:"Editorial",
    designBrief:"Two large full-width article photos: one top and one bottom. A substantial centre banner bridges them with enough height for the complete hook.",
    imageSlots:[{x:0,y:0,w:1000,h:600},{x:0,y:900,w:1000,h:600}],
    textSlot:{x:0,y:600,w:1000,h:300,fontSize:64,color:"#202020",align:"center",fontFamily:"serif",fontWeight:400,lineHeight:.96,maxCharsPerLine:22,maxLines:4,bgColor:"#f5eadb",shape:"rectangle",padding:26,textShadow:false},
    cta:cta("GET MORE IDEAS","#b64d36","#fff",330,1260,340),footer:footer("#fff")
  },
  {
    id:"layout-5",name:"Editorial Split + Bold Label",imageCount:2,...SIZE,backgroundFile:PREVIEW(5),family:"magazine-split",category:"Fashion & Beauty",
    designBrief:"Two full-height editorial panels with a strong headline block crossing the lower middle. No empty top or bottom canvas.",
    imageSlots:[{x:0,y:0,w:620,h:1500},{x:620,y:0,w:380,h:1500}],
    textSlot:{x:45,y:975,w:910,h:280,fontSize:64,color:"#fff",align:"left",fontFamily:"display",fontWeight:700,lineHeight:.92,maxCharsPerLine:19,maxLines:4,textTransform:"uppercase",bgColor:"#171717",shape:"soft",borderRadius:16,padding:25,textShadow:false},
    cta:cta("SEE MORE IDEAS","#f5eadb","#171717",55,1295,300),footer:footer("#fff","right")
  },
  {
    id:"layout-6",name:"3-Photo Editorial Stack",imageCount:3,...SIZE,backgroundFile:PREVIEW(6),family:"asymmetric-three",category:"Editorial & Fashion",
    designBrief:"One large top photo and two large lower photos fill the pin. A bold centre band overlays the junction instead of forcing photos into tiny cards.",
    imageSlots:[{x:0,y:0,w:1000,h:720},{x:0,y:720,w:500,h:780},{x:500,y:720,w:500,h:780}],
    textSlot:{x:55,y:600,w:890,h:270,fontSize:63,color:"#fff",align:"left",fontFamily:"sans",fontWeight:800,lineHeight:.92,maxCharsPerLine:20,maxLines:3,textTransform:"uppercase",bgColor:"#111",shape:"rectangle",padding:25,textShadow:false},
    cta:cta("EXPLORE MORE IDEAS","#c65a40","#fff",55,1320,320),footer:footer("#fff","right")
  },
  {
    id:"layout-7",name:"4-Photo Moodboard Grid",imageCount:4,...SIZE,backgroundFile:PREVIEW(7),family:"moodboard-four",category:"Lifestyle & Fashion",
    designBrief:"Clean four-photo grid with subtle framing and a strong headline ribbon. All four article images remain large enough to identify.",
    imageSlots:[{x:0,y:0,w:500,h:750},{x:500,y:0,w:500,h:750},{x:0,y:750,w:500,h:750},{x:500,y:750,w:500,h:750}],
    textSlot:{x:75,y:625,w:850,h:220,fontSize:55,color:"#242424",align:"center",fontFamily:"serif",fontWeight:400,lineHeight:.98,maxCharsPerLine:24,maxLines:3,bgColor:"#f7ead8",shape:"soft",borderRadius:24,padding:20,textShadow:false},
    cta:cta("VIEW MORE IDEAS","#242424","#fff",360,1295,280),footer:footer("#fff")
  },
  {
    id:"layout-8",name:"3-Photo Step Strip",imageCount:3,...SIZE,backgroundFile:PREVIEW(8),family:"three-strip",category:"Recipes & How-To",
    designBrief:"Three large horizontal photos stacked edge-to-edge. Headline and CTA sit over the photography rather than leaving blank bands.",
    imageSlots:[{x:0,y:0,w:1000,h:500},{x:0,y:500,w:1000,h:500},{x:0,y:1000,w:1000,h:500}],
    textSlot:{x:50,y:95,w:900,h:220,fontSize:61,color:"#fff",align:"left",fontFamily:"display",fontWeight:700,lineHeight:.94,maxCharsPerLine:23,maxLines:3,textTransform:"uppercase",bgColor:"#183027",shape:"soft",borderRadius:14,padding:22,textShadow:false},
    cta:cta("READ MORE IDEAS","#fff","#183027",335,1360,330),footer:footer("#fff","right")
  },
  {
    id:"layout-9",name:"Hero + Bottom Ribbon",imageCount:1,...SIZE,backgroundFile:PREVIEW(9),family:"bottom-ribbon",category:"Beauty & Wellness",
    designBrief:"Full-bleed hero photo with a wide lower ribbon. The ribbon is placed in the lower third and never creates a blank canvas area.",
    imageSlots:[{x:0,y:0,w:1000,h:1500}],
    textSlot:{x:50,y:1010,w:900,h:235,fontSize:62,color:"#fff8f4",align:"center",fontFamily:"serif",fontWeight:400,lineHeight:.96,maxCharsPerLine:23,maxLines:3,bgColor:"#7b3853",shape:"soft",borderRadius:24,padding:22,textShadow:false},
    cta:cta("EXPLORE MORE IDEAS","#fff8f4","#242024",335,1285,330),footer:footer("#fff8f4")
  },
  {
    id:"layout-10",name:"Product Hero + Overlay Card",imageCount:2,...SIZE,backgroundFile:PREVIEW(10),family:"product-edit",category:"Fashion & Beauty",
    designBrief:"Two-photo product/editorial composition: one dominant image with a secondary strip. Headline is an overlay card, not a blank section.",
    imageSlots:[{x:0,y:0,w:1000,h:1050},{x:0,y:1050,w:1000,h:450}],
    textSlot:{x:55,y:820,w:890,h:245,fontSize:59,color:"#202020",align:"left",fontFamily:"serif",fontWeight:400,lineHeight:.96,maxCharsPerLine:22,maxLines:3,bgColor:"#f5eadb",shape:"soft",borderRadius:18,padding:22,textShadow:false},
    cta:cta("SEE MORE IDEAS","#202020","#fff",55,1290,310),footer:footer("#fff","right")
  },
  {
    id:"layout-11",name:"Full Hero + Side Panel",imageCount:1,...SIZE,backgroundFile:PREVIEW(11),family:"side-panel",category:"Listicles",
    designBrief:"Full hero image with a semi-transparent side panel overlay. The photo remains edge-to-edge while the panel carries the hook.",
    imageSlots:[{x:0,y:0,w:1000,h:1500}],
    textSlot:{x:45,y:220,w:380,h:820,fontSize:56,color:"#202020",align:"left",fontFamily:"sans",fontWeight:800,lineHeight:.98,maxCharsPerLine:12,maxLines:10,textTransform:"uppercase",bgColor:"#f4eadcf2",shape:"rectangle",padding:22,textShadow:false},
    cta:cta("SEE MORE IDEAS","#c65a40","#fff",60,1085,300),footer:footer("#fff","right")
  },
  {
    id:"layout-12",name:"Before + After Split",imageCount:2,...SIZE,backgroundFile:PREVIEW(12),family:"before-after",category:"Home & DIY",
    designBrief:"Two full-width photos stacked vertically with a centre headline card at the join. Both photos remain dominant and uncropped beyond normal cover fitting.",
    imageSlots:[{x:0,y:0,w:1000,h:600},{x:0,y:900,w:1000,h:600}],
    textSlot:{x:0,y:600,w:1000,h:300,fontSize:58,color:"#202020",align:"center",fontFamily:"serif",fontWeight:400,lineHeight:.97,maxCharsPerLine:23,maxLines:3,bgColor:"#f5eadb",shape:"soft",borderRadius:22,padding:22,textShadow:false},
    cta:cta("EXPLORE MORE IDEAS","#36503d","#fff",300,1360,400),footer:footer("#fff")
  },
  {
    id:"layout-13",name:"Hero + Two Detail Photos",imageCount:3,...SIZE,backgroundFile:PREVIEW(13),family:"hero-two-details",category:"Lifestyle",
    designBrief:"One dominant hero photo plus two large detail photos below. A strong headline overlaps the lower part of the hero.",
    imageSlots:[{x:0,y:0,w:1000,h:900},{x:0,y:900,w:500,h:600},{x:500,y:900,w:500,h:600}],
    textSlot:{x:70,y:700,w:860,h:250,fontSize:60,color:"#fff",align:"center",fontFamily:"display",fontWeight:700,lineHeight:.93,maxCharsPerLine:22,maxLines:3,textTransform:"uppercase",bgColor:"#171717e8",shape:"soft",borderRadius:16,padding:22,textShadow:false},
    cta:cta("SEE MORE IDEAS","#c65a40","#fff",350,1370,300),footer:footer("#fff")
  },
  {
    id:"layout-14",name:"4-Photo Masonry Editorial",imageCount:4,...SIZE,backgroundFile:PREVIEW(14),family:"scrapbook",category:"Lifestyle & Fashion",
    designBrief:"Asymmetric four-photo masonry composition that fills the canvas. A wide paper banner crosses the middle without shrinking the image areas excessively.",
    imageSlots:[{x:0,y:0,w:600,h:700},{x:600,y:0,w:400,h:700},{x:0,y:700,w:400,h:800},{x:400,y:700,w:600,h:800}],
    textSlot:{x:70,y:610,w:860,h:250,fontSize:56,color:"#242424",align:"center",fontFamily:"serif",fontWeight:400,lineHeight:.97,maxCharsPerLine:24,maxLines:3,bgColor:"#f7ead8",shape:"soft",borderRadius:18,padding:22,textShadow:false},
    cta:cta("SAVE MORE IDEAS","#242424","#fff",350,1370,300),footer:footer("#fff")
  },
];

export const TEMPLATES:TemplateDef[]=RAW_TEMPLATES.map(t=>({...t,selectionLabel:t.selectionLabel||t.name}));
export function getTemplate(id:string){const t=TEMPLATES.find(x=>x.id===id);if(!t)throw new Error(`Unknown template id: ${id}`);return t;}
export async function getAllTemplates(){const {getCustomTemplates}=await import("./templateStore");return [...TEMPLATES,...(await getCustomTemplates())];}
export async function getTemplateById(id:string){const built=TEMPLATES.find(x=>x.id===id);if(built)return built;const all=await getAllTemplates();const found=all.find(x=>x.id===id);if(!found)throw new Error(`Unknown template id: ${id}`);return found;}
