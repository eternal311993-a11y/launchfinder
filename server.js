import express from "express";
import OpenAI from "openai";

const app=express();
app.use(express.json());
app.use(express.static("public"));

app.get("/api/health",(_,res)=>res.json({ok:true,service:"LaunchFinder"}));

app.post("/api/generate",async(req,res)=>{
  const idea=String(req.body?.idea||"").trim().slice(0,500);
  if(!idea) return res.status(400).json({error:"Tell us what business you're starting."});
  try{
    let names=[];
    if(process.env.OPENAI_API_KEY){
      const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
      const out=await client.responses.create({model:"gpt-5-mini",input:`Generate exactly 8 short brandable business names for this business: ${idea}. Return ONLY a JSON array of strings. Avoid trademarks and do not claim domain availability.`});
      names=JSON.parse(out.output_text);
    } else {
      const words=idea.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(Boolean).slice(0,3);
      const root=words.map(w=>w[0]?.toUpperCase()+w.slice(1)).join("")||"Launch";
      names=[root+"HQ",root+"Pro",root+"Works",root+"Now",root+"Base",root+"Pilot",root+"Forge",root+"Flow"];
    }
    res.json({names:names.slice(0,8).map(name=>({name,domain:name.toLowerCase().replace(/[^a-z0-9]/g,"")+".com"}))});
  }catch(e){res.status(500).json({error:"Generation failed. Please try again."});}
});

const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`LaunchFinder running on ${port}`));