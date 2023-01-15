import { OctopusApp } from "octopus-app";
import * as request from "request";
import * as deepl from "deepl-node";

export class NovelChat extends OctopusApp {
    type: string = "novel-chat";
    
    novelAIKey: string;
    token: string;
    connectedNovelAI = false;

    deeplKey: string;
    deeplTranslator: deepl.Translator;
    translate: boolean;

    twitchChannel: string;
    twitchMessages: any[] = [];
    twitchMessageNumber = 4;
    twitchMessageMax = this.twitchMessageNumber * 3;
    twitchMessageCount = 0;
    twitchMessageTTL = 60000;
    forceAnswer = false;

    generationRefreshTimeout = 1000;
    generationGlobalTimeout = 5000;
    lastGenerationTimestamp = 0;
    generationIntervalId: NodeJS.Timer;

    constructor(octopusUrl: string, novelAIKey: string, deeplKey: string, twitchChannel: string, translate: boolean = true) {
        super(octopusUrl);
        
        if (this.twitchMessageNumber <= 1)
            console.warn(`/!\\ Be careful, bot will never stop to generate messages because twitchMessageNumber is set to ${this.twitchMessageNumber} /!\\`);

        this.novelAIKey = novelAIKey;
        this.deeplKey = deeplKey;
        this.twitchChannel = twitchChannel;
        this.translate = translate;
    }

    connect(): void {
        request.post("https://api.novelai.net/user/login",
            {
                headers: {
                    "Content-Type": "application/json",
                    "accept": "application/json",
                },
                body: JSON.stringify({
                    key: this.novelAIKey
                })
            }, 
            (err, res, body) => {
                if (err != undefined) {
                    console.error(`[${this.logHeader}] Error on login : ${err}`);
                    return;
                }

                body = JSON.parse(body);
                if (res.statusCode != 201) {
                    console.error(`[${this.logHeader}] Login failed with code ${res.statusCode} : ${body["message"]}`);
                    return;
                }
                
                this.token = body.accessToken;
                this.connectedNovelAI = true;
                
                this.deeplTranslator = new deepl.Translator(this.deeplKey);

                super.connect();
                this.generationIntervalId = setInterval(this.generateFromChat.bind(this), this.generationRefreshTimeout);
            });
    }

    getInfos(callback: request.RequestCallback = undefined) {
        if (!this.connectedNovelAI) {
            console.error(`[${this.logHeader}] Could not fetch user infos : not connected to novelAI`)
            return;
        }

        return request.get("https://api.novelai.net/user/information", 
            {
                headers: {
                    "Content-Type": "application/json",
                    "accept": "application/json",
                    "Authorization": `Bearer ${this.token}`
                }
            },
            callback);
    }

    onInit(message: any): boolean {
        if(!super.onInit(message))
            return false;
        
        this.subscribeToBroadcast("twitchChatMessage")
            .then(() => console.log(`[${this.logHeader}] Listening to twitch messages.`))
            .catch((err) => console.log(`[${this.logHeader}] Could not subscribe to twitch messages broadcast : ${err}`));

        return true;
    }

    onBroadcast(message: any): void {
        super.onBroadcast(message);

        switch(message.channel) {
            case "twitchChatMessage":
                // this.sendBroadcast("twitchWriteMessage", {channel: "negeko", message: "<-" + message.content.msg});
                this.processTwitchMessage(message.content);
                break;

            default:
                console.warn(`[${this.logHeader}] Unknown broadcast channel : ${message.channel}`);
                break;    
        }
    }

    processTwitchMessage(twitchMessage: any) {
        if (twitchMessage.target != this.twitchChannel || twitchMessage.self)
            return;

        twitchMessage.msg = twitchMessage.msg.replaceAll(/mdr+/ig, "");
        if(twitchMessage.msg.length <= 0)
            return;

        if (this.translate) {
            this.deeplTranslator.translateText(`${twitchMessage.msg}`, 'fr', 'en-US')
                .then((result) => {
                    this.pushText(twitchMessage.user, result.text, false);
                }).catch((err) => {
                    console.error(`[${this.logHeader}] Could not translate with deepl : ${err}`);
                });
        } else {
            this.pushText(twitchMessage.user, twitchMessage.msg, false);
        }
    }

    pushText(user: string, msg: string, self: boolean) {
        this.twitchMessages.push({line: `${user} : "${msg}"`, timestamp: Date.now()});
        // console.log(this.twitchMessages);
        
        if(!self)
            this.twitchMessageCount ++;

        if(!self && msg.toLocaleLowerCase().indexOf("@negebot") >= 0) {
            this.forceAnswer = true;
        }
        
        this.cleanupMessages();
    }

    cleanupMessages() {
        let i = 0;
        for(i = 0; i < this.twitchMessages.length && (((Date.now() - this.twitchMessages[i].timestamp) > this.twitchMessageTTL) || (this.twitchMessages.length - i > this.twitchMessageMax)); i++);

        this.twitchMessages = this.twitchMessages.slice(i);        
    }

    generateFromChat() {
        if(!this.forceAnswer && (this.twitchMessageCount < this.twitchMessageNumber || (Date.now() - this.lastGenerationTimestamp) < this.generationGlobalTimeout))
            return;
        
        let input = 'negebot is a bot that obeys to everyone. He answers to the tag @negebot.\n';
        for (let message of this.twitchMessages) {
            input += `${message.line}\n`;
        }

        // input = `A casual discussion between viewers.\n${input}`;
        input += 'negebot : "';

        this.twitchMessageCount = 0;
        this.forceAnswer = false;

        return this.generateAnswer(input);
    }

    // generateFromQuestion(user: string, msg: string) {
    //     let input = `${user} : "${msg}"\n`;
    //     input += 'Negebot : "';

    //     return this.generateAnswer(input);
    // }

    generateAnswer(input: string) {
        console.log(input);

        let body = {
            "input": input,
            "model": "hypebot",
            "parameters": {
                "use_string": true,
                "temperature": 1,
                "min_length": 10,
                "max_length": 30
            }
        };

        return request.post("https://api.novelai.net/ai/generate", 
            {
                headers: {
                    "Content-Type": "application/json",
                    "accept": "application/json",
                    "Authorization": `Bearer ${this.token}`
                },
                body: JSON.stringify(body),
            },
            (err, res, body) => {
                if (err != undefined) {
                    console.error(`[${this.logHeader}] Error on login : ${err}`);
                    return;
                }

                body = JSON.parse(body);
                if (res.statusCode != 201) {
                    console.error(`[${this.logHeader}] Login failed with code ${res.statusCode} : ${body["message"]}`);
                    return;
                }

                let novelAIOutput = body.output.split('"')[0];
                this.pushText("negebot", novelAIOutput, true);
                if (this.translate) {
                    this.deeplTranslator.translateText(`${novelAIOutput}`, null, 'fr')
                        .then((result) => {
                            // console.log(result.text);
                            this.sendBroadcast("twitchWriteMessage", {channel: "negeko", message: result.text});
                        }).catch((err) => {
                            console.error(`[${this.logHeader}] Could not translate with deepl : ${err}`);
                        });
                } else {
                    // console.log(novelAIOutput);
                    this.sendBroadcast("twitchWriteMessage", {channel: "negeko", message: novelAIOutput});
                }
            });
    }

    stop() {
        super.stop();

        if(this.generationIntervalId !== undefined)
            clearInterval(this.generationIntervalId);
    }

    get logHeader(): string {
        return `NovelChat`
    }
}