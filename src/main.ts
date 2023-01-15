import { NovelChat } from "./NovelChat";
import * as fs from "fs";

let settingsPath = "./settings.json";
let keys : any = JSON.parse(fs.readFileSync(settingsPath).toString());


/*
let channel = "bagherajones";
/*/
let channel = "#negeko";
//*/
let chat = new NovelChat("ws://localhost:8000", keys["novelAI"]["negeko-inscriptions@hotmail.com"], keys["deepl"]["negeko-inscriptions@hotmail.com"], channel, true);
chat.connect();