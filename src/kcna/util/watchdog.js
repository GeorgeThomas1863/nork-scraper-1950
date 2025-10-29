//FUCKED, NEED TO UNFUCK

// import CONFIG from "../../../config/config.js";
// import kcnaState from "./state.js";

// import { runStopScrape, runNewScrape } from "../../control.js";

// //ALL EXECUTED IN LOG
// export const stopWatchdog = async () => {
//   if (!kcnaState.watchdogIntervalId) return null;

//   console.log("STOPPING WATCHDOG AT " + new Date().toISOString());

//   clearInterval(kcnaState.watchdogIntervalId);
//   kcnaState.watchdogIntervalId = null;

//   return true;
// };

// export const updateWatchdog = async () => {
//   kcnaState.lastUpdateTime = Date.now();
//   kcnaState.isFucked = false;

//   return true;
// };

// export const runWatchdog = () => {
//   const { watchdogTimeout } = CONFIG;
//   // Clear any existing watchdog
//   stopWatchdog();

//   // Initialize activity time
//   kcnaState.lastUpdateTime = Date.now();
//   kcnaState.isFucked = false;

//   // Check every 10 seconds
//   kcnaState.watchdogIntervalId = setInterval(async () => {
//     const timeSinceActivity = Date.now() - kcnaState.lastUpdateTime;

//     //2 min
//     if (timeSinceActivity > watchdogTimeout) {
//       console.error(`⚠️ Watchdog: Scraper stuck at step "${kcnaState.scrapeStep}" for ${Math.round(timeSinceActivity / 1000)}s`);
//       kcnaState.isFucked = true;

//       try {
//         //stop scrape and restart it
//         await runStopScrape({ site: "kcna" });
//         await runNewScrape({ site: "kcna" });
//       } catch (e) {
//         console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
//         await stopWatchdog();
//         return null;
//       }
//     }
//   }, 10000); // Check every 10 seconds

//   console.log(`✓ Watchdog started with ${watchdogTimeout / 1000}s timeout`);
// };
