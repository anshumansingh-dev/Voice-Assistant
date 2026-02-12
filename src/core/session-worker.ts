// import { FrameBus } from "./frame-bus.js";
// import { SonioxService } from "../stt.js";

// export class SessionWorker {
//   bus = new FrameBus();
//   stt = new SonioxService(this.bus);

//   async init(sessionId: string) {
//     this.stt.connect();

//     this.bus.subscribe("audio", (f: any) => {
//       this.stt.sendAudio(f.data);
//     });

//     this.bus.subscribe("transcript", (f: any) => {
//       if (f.final) {
//         console.log("🗣 USER SAID:", f.text);
//       }
//     });
//   }
// }
