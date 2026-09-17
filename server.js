import express from "express";
import cors from "cors";
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json({limit:"1mb"}));

const PORT = process.env.PORT || 3000;
const COBALT_API = process.env.COBALT_API || "";

function validUrl(value){
  try {
    const u = new URL(value);
    return ["http:","https:"].includes(u.protocol);
  } catch { return false; }
}

function runYtDlp(args){
  return new Promise((resolve,reject)=>{
    const child = spawn("yt-dlp",args);
    let stdout="", stderr="";
    child.stdout.on("data",d=>stdout+=d.toString());
    child.stderr.on("data",d=>stderr+=d.toString());
    child.on("error",reject);
    child.on("close",code=>{
      if(code!==0) reject(new Error(stderr || "yt-dlp failed"));
      else resolve(stdout.trim());
    });
  });
}

async function getInfo(url){
  const out = await runYtDlp([
    "--no-playlist","--dump-single-json","--skip-download",url
  ]);
  return JSON.parse(out);
}

function normalizeFormats(info){
  return (info.formats||[])
    .filter(f=>f.url)
    .map(f=>({
      id:f.format_id, ext:f.ext||"mp4",
      quality:f.format_note||f.resolution||"Unknown",
      height:f.height||0, width:f.width||0,
      vCodec:f.vcodec||"none", aCodec:f.acodec||"none"
    }))
    .sort((a,b)=>(b.height||0)-(a.height||0));
}

async function ytDownload(url, format="best"){
  const out = await runYtDlp([
    "--no-playlist","-f",format,"--get-url",url
  ]);
  const urls = out.split("\n").map(x=>x.trim()).filter(Boolean);
  if(!urls.length) throw new Error("No media URL returned");
  return urls[0];
}

async function cobalt(url){
  if(!COBALT_API) throw new Error("Cobalt is not configured");
  const r = await fetch(COBALT_API,{
    method:"POST",
    headers:{"Accept":"application/json","Content-Type":"application/json"},
    body:JSON.stringify({
      url, videoQuality:"720", videoCodec:"h264", downloadMode:"auto"
    })
  });
  const data = await r.json();
  if(!r.ok || !data.url) throw new Error(data?.error?.code||"Cobalt failed");
  return data.url;
}

app.get("/",(req,res)=>res.json({
  ok:true, service:"VIDLUXE PRO Gateway", status:"online",
  engines:{ytDlp:true,cobalt:Boolean(COBALT_API)}
}));

app.post("/api/info",async(req,res)=>{
  const {url}=req.body;
  if(!url||!validUrl(url)) return res.status(400).json({ok:false,error:"Invalid URL"});
  try{
    const info=await getInfo(url);
    res.json({ok:true,engine:"yt-dlp",data:{
      title:info.title||"Video",
      thumbnailUrl:info.thumbnail||"",
      duration:info.duration||0,
      uploader:info.uploader||"",
      formats:normalizeFormats(info)
    }});
  }catch(e){
    console.error("yt-dlp info:",e.message);
    res.status(502).json({ok:false,error:{message:"Unable to read media information."}});
  }
});

app.post("/api/download",async(req,res)=>{
  const {url,format}=req.body;
  if(!url||!validUrl(url)) return res.status(400).json({ok:false,error:"Invalid URL"});

  try{
    const mediaUrl=await ytDownload(url,format||"best");
    return res.json({ok:true,engine:"yt-dlp",url:mediaUrl});
  }catch(e){ console.error("yt-dlp failed:",e.message); }

  try{
    const mediaUrl=await cobalt(url);
    return res.json({ok:true,engine:"cobalt",url:mediaUrl});
  }catch(e){ console.error("Cobalt failed:",e.message); }

  res.status(502).json({ok:false,error:{message:"Both yt-dlp and Cobalt failed."}});
});

app.listen(PORT,()=>console.log(`VIDLUXE Gateway listening on ${PORT}`));
